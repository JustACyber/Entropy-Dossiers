    using System;
    using System.IO;
    using System.Net.Http;
    using System.Threading.Tasks;
    using DSharpPlus;
    using DSharpPlus.CommandsNext;
    using DSharpPlus.CommandsNext.Attributes;
    using DSharpPlus.Entities;
    using DSharpPlus.Interactivity;
    using DSharpPlus.Interactivity.Extensions;
    using DotNetEnv;
    using Newtonsoft.Json.Linq;

    namespace Helper
    {
        class Program
        {
            static void Main(string[] args)
            {
                var program = new Program();
                program.MainAsync().GetAwaiter().GetResult();
            }

            public async Task MainAsync()
            {
                Console.WriteLine(">>> STARTING BOT INITIALIZATION...");

                // 1. Попытка загрузить .env (только для локального теста)
                string envPath = FindEnvFile();
                if (!string.IsNullOrEmpty(envPath))
                {
                    Env.Load(envPath);
                    Console.WriteLine($"> Loaded .env from: {envPath}");
                }

                // 2. Получение токена
                var token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");
                if (string.IsNullOrWhiteSpace(token))
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine(">>> CRITICAL ERROR: DISCORD_TOKEN is missing in Environment Variables.");
                    Console.ResetColor();
                    // Задержка чтобы лог успел записаться перед падением контейнера
                    await Task.Delay(10000); 
                    return;
                }
                else 
                {
                    Console.WriteLine($"> Token found (Length: {token.Length})");
                }

                // 3. Конфигурация клиента
                var discord = new DiscordClient(new DiscordConfiguration()
                {
                    Token = token,
                    TokenType = TokenType.Bot,
                    Intents = DiscordIntents.All,
                    AutoReconnect = true,
                    MinimumLogLevel = Microsoft.Extensions.Logging.LogLevel.Information
                });

                discord.UseInteractivity(new InteractivityConfiguration()
                {
                    Timeout = TimeSpan.FromSeconds(30)
                });

                var commands = discord.UseCommandsNext(new CommandsNextConfiguration()
                {
                    StringPrefixes = new[] { "!" },
                    EnableDms = true,
                    EnableMentionPrefix = true
                });

                commands.RegisterCommands<DossierCommands>();

                // 4. Запуск
                try 
                {
                    await discord.ConnectAsync();
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine("==========================================");
                    Console.WriteLine($"Bot connected as: {discord.CurrentUser.Username}");
                    Console.WriteLine("Ready to serve the Ordo Continuum.");
                    Console.WriteLine("==========================================");
                    Console.ResetColor();
                    
                    // Бесконечное ожидание, чтобы программа не завершилась
                    await Task.Delay(-1);
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"Connection failed: {ex.Message}");
                    Console.ResetColor();
                    await Task.Delay(10000); // Ждем перед выходом при ошибке
                }
            }

            private string FindEnvFile()
            {
                try 
                {
                    var current = Directory.GetCurrentDirectory();
                    while (current != null)
                    {
                        var path = Path.Combine(current, ".env");
                        if (File.Exists(path)) return path;
                        current = Directory.GetParent(current)?.FullName;
                    }
                } 
                catch {}
                return null;
            }
        }

        public class DossierCommands : BaseCommandModule
        {
            private readonly HttpClient _http = new HttpClient();
            
            // Configuration matching the frontend
            private const string PROJECT_ID = "ordo-continuum-dossiers";
            private const string APP_ID = "ordo-continuum-v12";
            // API Key
            private const string API_KEY = "AIzaSyB1gqid0rb9K-z0lKNTpyKiFpOKUl7ffrM";

            [Command("dossier")]
            [Description("Fetches a dossier from the registry by ID or URL.")]
            public async Task GetDossier(CommandContext ctx, [Description("Protocol ID or URL")] string input)
            {
                await ctx.TriggerTypingAsync();

                string id = ExtractId(input);
                if (string.IsNullOrEmpty(id))
                {
                    await ctx.RespondAsync("⚠️ Invalid protocol identifier.");
                    return;
                }

                var (data, isResistance) = await FetchProtocolData(id);

                if (data == null)
                {
                    await ctx.RespondAsync("❌ Protocol not found in the Registry.");
                    return;
                }

                var embed = BuildDossierEmbed(data, id, isResistance);
                await ctx.RespondAsync(embed: embed);
            }

            private string ExtractId(string input)
            {
                // Очистка от пробелов
                input = input.Trim();

                if (input.Contains("/dossier/"))
                {
                    var parts = input.Split(new[] { "/dossier/" }, StringSplitOptions.None);
                    return parts.Length > 1 ? parts[1].Split('?')[0].Split('#')[0] : input;
                }
                if (input.Contains("/resistance/dossier/"))
                {
                    var parts = input.Split(new[] { "/resistance/dossier/" }, StringSplitOptions.None);
                    return parts.Length > 1 ? parts[1].Split('?')[0].Split('#')[0] : input;
                }
                return input;
            }

            private async Task<(JObject, bool)> FetchProtocolData(string id)
            {
                // 1. Пробуем Империю
                string urlEmpire = $"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/artifacts/{APP_ID}/public/data/protocols/{id}?key={API_KEY}";
                
                try 
                {
                    var response = await _http.GetAsync(urlEmpire);
                    if (response.IsSuccessStatusCode)
                    {
                        string json = await response.Content.ReadAsStringAsync();
                        return (JObject.Parse(json), false);
                    }

                    // 2. Если не найдено (404), пробуем Сопротивление
                    string urlResistance = $"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/artifacts/{APP_ID}/resistance/data/protocols/{id}?key={API_KEY}";
                    response = await _http.GetAsync(urlResistance);
                    if (response.IsSuccessStatusCode)
                    {
                        string json = await response.Content.ReadAsStringAsync();
                        return (JObject.Parse(json), true);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Error] Fetching data for {id}: {ex.Message}");
                }

                return (null, false);
            }

            private DiscordEmbed BuildDossierEmbed(JObject firestoreData, string id, bool isResistance)
            {
                // Helper для извлечения полей из странной структуры Firestore REST JSON
                string GetField(string path)
                {
                    // Путь в JSON: fields -> ИМЯ_ПОЛЯ -> stringValue/integerValue
                    // path приходит в формате "meta.mapValue.fields.name"
                    // Нам нужно разбить его или использовать SelectToken, если структура совпадает
                    
                    // Firestore REST API возвращает структуру:
                    // { "name": "...", "fields": { "meta": { "mapValue": { "fields": { "name": { "stringValue": "..." } } } } } }
                    
                    // SelectToken ищет от корня объекта.
                    // Добавляем "fields." в начало, так как Firestore оборачивает данные в "fields"
                    var token = firestoreData.SelectToken($"fields.{path}");
                    
                    if (token == null) return "N/A";
                    
                    // Пытаемся взять значение как строку или число
                    return token["stringValue"]?.ToString() 
                        ?? token["integerValue"]?.ToString() 
                        ?? "N/A";
                }

                // Извлечение данных
                string name = GetField("meta.mapValue.fields.name");
                string rank = GetField("meta.mapValue.fields.rank");
                string cls = GetField("meta.mapValue.fields.class");
                string arch = GetField("meta.mapValue.fields.archetype");
                string race = GetField("meta.mapValue.fields.race");
                string level = GetField("meta.mapValue.fields.level");
                string image = GetField("meta.mapValue.fields.image");

                string hpMax = GetField("stats.mapValue.fields.hp_max");
                string ac = GetField("stats.mapValue.fields.ac");
                
                string analysis = GetField("psych.mapValue.fields.analysis");
                if (analysis.Length > 200) analysis = analysis.Substring(0, 197) + "...";

                // Оформление
                var color = isResistance ? new DiscordColor(0x38ff12) : new DiscordColor(0xd4af37);
                var footer = isResistance ? "RESISTANCE TERMINAL // SECURE" : "ORDO CONTINUUM // IMPERIAL REGISTRY";
                var iconUrl = isResistance ? "https://i.imgur.com/link_to_green_icon.png" : "https://i.imgur.com/link_to_gold_icon.png"; // Можно заменить на свои ссылки

                var embed = new DiscordEmbedBuilder()
                    .WithTitle(isResistance ? $"// SUBJECT: {name.ToUpper()}" : $"PROTOCOL: {name.ToUpper()}")
                    .WithDescription($"**ID:** {id.ToUpper()}\n**Rank:** {rank}\n**Data:** {race} {cls} / {arch}")
                    .WithColor(color)
                    .AddField("Combat Metrics", $"**LVL:** {level} | **HP:** {hpMax} | **AC:** {ac}", true)
                    .AddField("Analysis", string.IsNullOrWhiteSpace(analysis) || analysis == "N/A" ? "No data available." : analysis, false)
                    .WithFooter(footer);

                // Добавляем картинку только если это валидный URL
                if (!string.IsNullOrEmpty(image) && image != "N/A" && Uri.IsWellFormedUriString(image, UriKind.Absolute))
                {
                    embed.WithThumbnail(image);
                }

                return embed.Build();
            }
        }
    }

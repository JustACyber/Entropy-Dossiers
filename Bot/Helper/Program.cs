using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using DSharpPlus;
using DSharpPlus.CommandsNext;
using DSharpPlus.CommandsNext.Attributes;
using DSharpPlus.Entities;
using DSharpPlus.EventArgs;
using DSharpPlus.Interactivity;
using DSharpPlus.Interactivity.Extensions;
using DSharpPlus.SlashCommands;
using DotNetEnv;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Helper
{
    // --- DATA MODELS FOR STATE ---
    public class UserState
    {
        public string CharId { get; set; }
        public bool IsResistance { get; set; }
        public JObject Data { get; set; }
        public string CurrentTab { get; set; } = "identity";
    }

    class Program
    {
        // Global state cache: MessageID -> State
        public static Dictionary<ulong, UserState> ActiveSessions = new Dictionary<ulong, UserState>();
        public static readonly HttpClient HttpClient = new HttpClient();

        // Config
        public const string PROJECT_ID = "ordo-continuum-dossiers";
        public const string APP_ID = "ordo-continuum-v12";
        public const string API_KEY = "AIzaSyB1gqid0rb9K-z0lKNTpyKiFpOKUl7ffrM";

        static void Main(string[] args)
        {
            new Program().MainAsync().GetAwaiter().GetResult();
        }

        public async Task MainAsync()
        {
            Console.WriteLine(">>> STARTING ORDO BOT V2.1 (FIXED)...");

            string envPath = FindEnvFile();
            if (!string.IsNullOrEmpty(envPath)) Env.Load(envPath);

            var token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");
            if (string.IsNullOrWhiteSpace(token))
            {
                Console.WriteLine("CRITICAL: DISCORD_TOKEN missing.");
                await Task.Delay(5000);
                return;
            }

            var discord = new DiscordClient(new DiscordConfiguration()
            {
                Token = token,
                TokenType = TokenType.Bot,
                Intents = DiscordIntents.All,
                AutoReconnect = true,
                MinimumLogLevel = LogLevel.Information
            });

            discord.UseInteractivity(new InteractivityConfiguration() { Timeout = TimeSpan.FromMinutes(5) });

            // Text Commands
            var commands = discord.UseCommandsNext(new CommandsNextConfiguration()
            {
                StringPrefixes = new[] { "!" },
                EnableDms = true,
                EnableMentionPrefix = true
            });
            commands.RegisterCommands<DossierCommands>();

            // Slash Commands
            var slash = discord.UseSlashCommands();
            slash.RegisterCommands<DossierSlashCommands>();

            // --- EVENT HANDLERS ---
            discord.ComponentInteractionCreated += OnComponentInteraction;
            discord.ModalSubmitted += OnModalSubmitted;

            try
            {
                await discord.ConnectAsync();
                await Task.Delay(-1);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }

        public static string ExtractId(string input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            input = input.Trim();
            if (input.Contains("/dossier/")) return input.Split(new[] { "/dossier/" }, StringSplitOptions.None)[1].Split('?')[0];
            return input;
        }

        // --- INTERACTION HANDLER (BUTTONS & MENUS) ---
        private async Task OnComponentInteraction(DiscordClient sender, ComponentInteractionCreateEventArgs e)
        {
            if (!ActiveSessions.ContainsKey(e.Message.Id)) 
            {
                // Session expired or bot restarted
                await e.Interaction.CreateResponseAsync(InteractionResponseType.ChannelMessageWithSource, 
                    new DiscordInteractionResponseBuilder().WithContent("⚠️ Session expired. Please run `/dossier` again.").AsEphemeral(true));
                return;
            }

            var state = ActiveSessions[e.Message.Id];
            
            try 
            {
                // 1. Navigation Tabs
                if (e.Id.StartsWith("tab_"))
                {
                    state.CurrentTab = e.Id.Replace("tab_", "");
                    var (embed, components) = BuildInterface(state);
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.UpdateMessage, 
                        new DiscordInteractionResponseBuilder().AddEmbed(embed).AddComponents(components));
                }
                // 2. Open Modals
                else if (e.Id == "btn_edit_vitals")
                {
                    var hp = FirestoreHelper.GetField(state.Data, "stats.mapValue.fields.hp_curr") ?? "0";
                    var temp = FirestoreHelper.GetField(state.Data, "stats.mapValue.fields.hp_temp") ?? "0";
                    var shield = FirestoreHelper.GetField(state.Data, "stats.mapValue.fields.shield_curr") ?? "0";

                    var modal = new DiscordInteractionResponseBuilder()
                        .WithTitle("EDIT VITALS")
                        .WithCustomId($"modal_vitals_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("Current HP", "hp_curr", "Value", hp, min_length: 1, max_length: 4))
                        .AddComponents(new TextInputComponent("Temp HP", "hp_temp", "Value (0 to clear)", temp, required: false))
                        .AddComponents(new TextInputComponent("Shields", "shield_curr", "Value (0 to clear)", shield, required: false));

                    await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                else if (e.Id == "btn_add_item")
                {
                    var modal = new DiscordInteractionResponseBuilder()
                        .WithTitle("ADD ITEM / COUNTER")
                        .WithCustomId($"modal_add_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("Name", "name", "Item Name"))
                        .AddComponents(new TextInputComponent("Description / Value", "desc", "Description or numeric value"))
                        .AddComponents(new TextInputComponent("Type (inventory, weapon, counter)", "type", "inventory", "inventory"));

                    await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                // 3. Inspection (Dropdowns)
                else if (e.Id == "menu_inspect")
                {
                    var selectedId = e.Values.FirstOrDefault();
                    if (selectedId != null)
                    {
                        var desc = FindDescription(state.Data, selectedId);
                        await e.Interaction.CreateResponseAsync(InteractionResponseType.ChannelMessageWithSource, 
                            new DiscordInteractionResponseBuilder().WithContent($"**Info:**\n{desc}").AsEphemeral(true));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Interaction Error: {ex}");
                await e.Interaction.CreateFollowupMessageAsync(new DiscordFollowupMessageBuilder().WithContent("❌ Interface Error.").AsEphemeral(true));
            }
        }

        // --- MODAL HANDLER ---
        private async Task OnModalSubmitted(DiscordClient sender, ModalSubmitEventArgs e)
        {
            // Extract Message ID from Custom ID (modal_vitals_12345)
            var parts = e.Interaction.Data.CustomId.Split('_');
            if (parts.Length < 3 || !ulong.TryParse(parts[2], out ulong msgId)) return;
            if (!ActiveSessions.ContainsKey(msgId)) return;

            var state = ActiveSessions[msgId];
            await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);

            try
            {
                if (parts[1] == "vitals")
                {
                    var hp = e.Values["hp_curr"];
                    var temp = e.Values["hp_temp"];
                    var shield = e.Values["shield_curr"];

                    // Update Local State
                    FirestoreHelper.SetField(state.Data, "stats.mapValue.fields.hp_curr", hp);
                    FirestoreHelper.SetField(state.Data, "stats.mapValue.fields.hp_temp", temp);
                    FirestoreHelper.SetField(state.Data, "stats.mapValue.fields.shield_curr", shield);

                    // Send to Firebase
                    var updates = new Dictionary<string, object>
                    {
                        { "fields.stats.mapValue.fields.hp_curr.integerValue", int.Parse(hp) },
                        { "fields.stats.mapValue.fields.hp_temp.integerValue", int.Parse(temp) },
                        { "fields.stats.mapValue.fields.shield_curr.integerValue", int.Parse(shield) }
                    };
                    await FirestoreHelper.PatchFields(state.CharId, state.IsResistance, updates);
                }
                else if (parts[1] == "add")
                {
                    // For MVP showing alert.
                    await e.Interaction.CreateFollowupMessageAsync(new DiscordFollowupMessageBuilder().WithContent("⚠️ Item Addition via Discord is limited in this version.").AsEphemeral(true));
                    return;
                }

                // Refresh UI
                var (embed, components) = BuildInterface(state);
                await e.Interaction.EditOriginalResponseAsync(new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Modal Error: {ex}");
            }
        }

        // --- UI BUILDER ---
        public static (DiscordEmbed, List<DiscordActionRowComponent>) BuildInterface(UserState state)
        {
            var data = state.Data;
            bool isRes = state.IsResistance;
            var color = isRes ? new DiscordColor(0x38ff12) : new DiscordColor(0xd4af37);
            
            var name = FirestoreHelper.GetField(data, "meta.mapValue.fields.name") ?? "Unknown";
            var img = FirestoreHelper.GetField(data, "meta.mapValue.fields.image");
            
            var embed = new DiscordEmbedBuilder()
                .WithTitle(isRes ? $"// {name.ToUpper()}" : $"PROTOCOL: {name.ToUpper()}")
                .WithColor(color);

            if (!string.IsNullOrEmpty(img) && img.StartsWith("http")) embed.WithThumbnail(img);

            // Tab Logic
            switch (state.CurrentTab)
            {
                case "identity":
                    embed.WithDescription($"**ID:** {state.CharId}\n**Rank:** {FirestoreHelper.GetField(data, "meta.mapValue.fields.rank")}");
                    embed.AddField("Bio", $"{FirestoreHelper.GetField(data, "meta.mapValue.fields.race")} {FirestoreHelper.GetField(data, "meta.mapValue.fields.class")}", true);
                    embed.AddField("Archetype", FirestoreHelper.GetField(data, "meta.mapValue.fields.archetype") ?? "N/A", true);
                    var analysis = FirestoreHelper.GetField(data, "psych.mapValue.fields.analysis") ?? "N/A";
                    embed.AddField("Analysis", analysis.Substring(0, Math.Min(500, analysis.Length)), false);
                    break;

                case "stats":
                    string hp = FirestoreHelper.GetField(data, "stats.mapValue.fields.hp_curr") ?? "0";
                    string max = FirestoreHelper.GetField(data, "stats.mapValue.fields.hp_max") ?? "0";
                    string temp = FirestoreHelper.GetField(data, "stats.mapValue.fields.hp_temp") ?? "0";
                    string ac = FirestoreHelper.GetField(data, "stats.mapValue.fields.ac") ?? "10";
                    string sh = FirestoreHelper.GetField(data, "stats.mapValue.fields.shield_curr") ?? "0";

                    embed.AddField("VITALS", $"**HP:** {hp}/{max} {(temp!="0" ? $"(+{temp})" : "")}\n**AC:** {ac}\n**Shields:** {sh}", false);
                    
                    var attrs = new[] { "str", "dex", "con", "int", "wis", "cha" };
                    var attrStr = "";
                    foreach(var a in attrs)
                    {
                        // FIX: Removed .integerValue suffix here, GetField handles extraction
                        var valStr = FirestoreHelper.GetField(data, $"stats.mapValue.fields.{a}") ?? "10";
                        var val = int.Parse(valStr);
                        var mod = (val - 10) / 2;
                        attrStr += $"**{a.ToUpper()}:** {val} ({(mod>=0?"+":"")}{mod})\n";
                    }
                    embed.AddField("ATTRIBUTES", attrStr, false);
                    break;

                case "combat":
                    var weapons = FirestoreHelper.GetArray(data, "combat.mapValue.fields.weapons");
                    var sbW = new StringBuilder();
                    if (weapons.Count == 0) sbW.Append("No weapons.");
                    foreach(var w in weapons)
                    {
                         var wn = w["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString() ?? "Unknown";
                         var dmg = w["mapValue"]?["fields"]?["dmg"]?["stringValue"]?.ToString() ?? "";
                         sbW.AppendLine($"• **{wn}** {dmg}");
                    }
                    embed.AddField("WEAPONS", sbW.ToString());

                    var inv = FirestoreHelper.GetArray(data, "combat.mapValue.fields.inventory");
                    var sbI = new StringBuilder();
                    if (inv.Count == 0) sbI.Append("Empty.");
                    int count = 0;
                    foreach(var i in inv)
                    {
                        if(count++ > 10) { sbI.AppendLine("...and more"); break; }
                        var iname = i["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString() ?? "Item";
                        sbI.AppendLine($"• {iname}");
                    }
                    embed.AddField("INVENTORY", sbI.ToString());
                    break;

                case "features":
                    var feats = FirestoreHelper.GetArray(data, "features");
                    var sbF = new StringBuilder();
                    foreach(var f in feats.Take(10))
                    {
                        var fn = f["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString() ?? "Feat";
                        sbF.AppendLine($"• {fn}");
                    }
                    if(sbF.Length == 0) sbF.Append("No registered features.");
                    embed.AddField("FEATURES / ABILITIES", sbF.ToString());
                    break;
            }

            // COMPONENTS
            var rows = new List<DiscordActionRowComponent>();

            // Row 1: Navigation
            var btnStyle = isRes ? ButtonStyle.Success : ButtonStyle.Primary;
            var navRow = new DiscordActionRowComponent(new[]
            {
                new DiscordButtonComponent(btnStyle, "tab_identity", "ID", state.CurrentTab == "identity"),
                new DiscordButtonComponent(btnStyle, "tab_stats", "STATS", state.CurrentTab == "stats"),
                new DiscordButtonComponent(btnStyle, "tab_combat", "GEAR", state.CurrentTab == "combat"),
                new DiscordButtonComponent(btnStyle, "tab_features", "FEATS", state.CurrentTab == "features")
            });
            rows.Add(navRow);

            // Row 2: Actions
            var actionRow = new DiscordActionRowComponent(new[]
            {
                new DiscordButtonComponent(ButtonStyle.Secondary, "btn_edit_vitals", "Update Vitals"),
                new DiscordButtonComponent(ButtonStyle.Secondary, "btn_add_item", "Add Item")
            });
            rows.Add(actionRow);

            // Row 3: Inspect (Conditional)
            if (state.CurrentTab == "combat" || state.CurrentTab == "features")
            {
                var options = new List<DiscordSelectComponentOption>();
                var targetArray = state.CurrentTab == "combat" 
                    ? FirestoreHelper.GetArray(data, "combat.mapValue.fields.inventory")
                    : FirestoreHelper.GetArray(data, "features");

                int idx = 0;
                foreach (var item in targetArray.Take(25)) // Discord limit 25
                {
                    var iName = item["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                    if (!string.IsNullOrEmpty(iName))
                    {
                        options.Add(new DiscordSelectComponentOption(iName, iName)); 
                    }
                    idx++;
                }

                if (options.Count > 0)
                {
                    rows.Add(new DiscordActionRowComponent(new [] {
                        new DiscordSelectComponent("menu_inspect", "Inspect Item...", options)
                    }));
                }
            }

            return (embed.Build(), rows);
        }

        private static string FindDescription(JObject data, string itemName)
        {
            var arrays = new[] { "combat.mapValue.fields.inventory", "combat.mapValue.fields.weapons", "features", "abilities", "traits" };
            foreach(var path in arrays)
            {
                var list = FirestoreHelper.GetArray(data, path);
                foreach(var item in list)
                {
                    var n = item["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                    if (n == itemName)
                    {
                         var d = item["mapValue"]?["fields"]?["desc"]?["stringValue"]?.ToString();
                         var p = item["mapValue"]?["fields"]?["props"]?["stringValue"]?.ToString();
                         if (!string.IsNullOrEmpty(d)) return d;
                         if (!string.IsNullOrEmpty(p)) return p;
                         return "No description available.";
                    }
                }
            }
            return "Item not found.";
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
            } catch {}
            return null;
        }
    }

    // --- SLASH COMMANDS MODULE ---
    public class DossierSlashCommands : ApplicationCommandModule
    {
        [SlashCommand("dossier", "Retrieve a character dossier from the Ordo Registry.")]
        public async Task GetDossier(InteractionContext ctx, [Option("id", "Character ID or URL")] string input)
        {
            // Defer response because Firebase fetch might take a moment
            await ctx.CreateResponseAsync(InteractionResponseType.DeferredChannelMessageWithSource);

            try
            {
                string id = Program.ExtractId(input);
                if (string.IsNullOrEmpty(id)) 
                { 
                    await ctx.EditResponseAsync(new DiscordWebhookBuilder().WithContent("⚠️ Invalid ID or URL provided.")); 
                    return; 
                }

                var (data, isRes) = await FirestoreHelper.FetchProtocolData(id);

                if (data == null)
                {
                    await ctx.EditResponseAsync(new DiscordWebhookBuilder().WithContent("❌ Protocol not found in the database."));
                    return;
                }

                var state = new UserState { CharId = id, IsResistance = isRes, Data = data, CurrentTab = "identity" };
                
                var (embed, components) = Program.BuildInterface(state);
                
                // Edit the deferred response with the actual content
                var msg = await ctx.EditResponseAsync(new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components));
                
                // Cache state using the message ID of the response
                if (Program.ActiveSessions.ContainsKey(msg.Id)) Program.ActiveSessions.Remove(msg.Id);
                Program.ActiveSessions.Add(msg.Id, state);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Command Error: {ex}");
                await ctx.EditResponseAsync(new DiscordWebhookBuilder().WithContent($"❌ System Error: {ex.Message}"));
            }
        }
    }

    // --- TEXT COMMANDS MODULE (Legacy support) ---
    public class DossierCommands : BaseCommandModule
    {
        [Command("dossier")]
        public async Task GetDossier(CommandContext ctx, [Description("ID")] string input)
        {
            await ctx.TriggerTypingAsync();
            string id = Program.ExtractId(input);
            if (string.IsNullOrEmpty(id)) { await ctx.RespondAsync("⚠️ Invalid ID"); return; }

            var (data, isRes) = await FirestoreHelper.FetchProtocolData(id);

            if (data == null)
            {
                await ctx.RespondAsync("❌ Protocol not found.");
                return;
            }

            var state = new UserState { CharId = id, IsResistance = isRes, Data = data, CurrentTab = "identity" };
            
            var (embed, components) = Program.BuildInterface(state);
            var builder = new DiscordMessageBuilder().AddEmbed(embed).AddComponents(components);
            
            var msg = await ctx.RespondAsync(builder);
            
            if (Program.ActiveSessions.ContainsKey(msg.Id)) Program.ActiveSessions.Remove(msg.Id);
            Program.ActiveSessions.Add(msg.Id, state);
        }
    }

    // --- FIRESTORE HELPER ---
    public static class FirestoreHelper
    {
        public static string GetField(JObject root, string path)
        {
            JToken current = root["fields"];
            if (current == null) return null;

            var parts = path.Split('.');
            foreach (var part in parts)
            {
                current = current[part];
                if (current == null) return null;
            }

            // It extracts the Value object (e.g., { "integerValue": "10" } or { "stringValue": "foo" })
            return current["stringValue"]?.ToString() ?? current["integerValue"]?.ToString();
        }

        public static void SetField(JObject root, string path, string value)
        {
            JToken current = root["fields"];
            if (current == null) return;
            var parts = path.Split('.');
            foreach (var part in parts)
            {
                if (current[part] == null) current[part] = new JObject();
                current = current[part];
            }
            if (current["integerValue"] != null) current["integerValue"] = value;
            else current["stringValue"] = value;
        }

        public static JArray GetArray(JObject root, string path)
        {
            JToken current = root["fields"];
            if (current == null) return new JArray();
            var parts = path.Split('.');
            foreach (var part in parts)
            {
                current = current[part];
                if (current == null) return new JArray();
            }
            return (JArray)(current["arrayValue"]?["values"]) ?? new JArray();
        }

        public static async Task<(JObject, bool)> FetchProtocolData(string id)
        {
            string urlEmp = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/public/data/protocols/{id}?key={Program.API_KEY}";
            var res = await Program.HttpClient.GetAsync(urlEmp);
            if (res.IsSuccessStatusCode)
                return (JObject.Parse(await res.Content.ReadAsStringAsync()), false);

            string urlRes = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/resistance/data/protocols/{id}?key={Program.API_KEY}";
            res = await Program.HttpClient.GetAsync(urlRes);
            if (res.IsSuccessStatusCode)
                return (JObject.Parse(await res.Content.ReadAsStringAsync()), true);

            return (null, false);
        }

        public static async Task PatchFields(string id, bool isRes, Dictionary<string, object> updates)
        {
            string collection = isRes ? "resistance/data/protocols" : "public/data/protocols";
            string baseUrl = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/{collection}/{id}";
            
            var mask = string.Join("&", updates.Keys.Select(k => $"updateMask.fieldPaths={k.Replace("fields.", "").Replace(".integerValue", "").Replace(".stringValue", "")}"));
            string url = $"{baseUrl}?{mask}&key={Program.API_KEY}";
            
            var jsonBody = new JObject();
            var fields = new JObject();
            jsonBody["fields"] = fields;

            var stats = new JObject();
            var mapVal = new JObject();
            var sFields = new JObject();
            
            foreach(var kvp in updates)
            {
                var k = kvp.Key;
                var val = kvp.Value;
                var varName = k.Split('.')[4]; 
                var valObj = new JObject();
                valObj["integerValue"] = val.ToString();
                sFields[varName] = valObj;
            }

            mapVal["fields"] = sFields;
            stats["mapValue"] = mapVal;
            fields["stats"] = stats;

            var content = new StringContent(jsonBody.ToString(), Encoding.UTF8, "application/json");
            
            var request = new HttpRequestMessage(new HttpMethod("PATCH"), url) { Content = content };
            var response = await Program.HttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"Patch Error: {response.StatusCode}");
            }
        }
    }
}

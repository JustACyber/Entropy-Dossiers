using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.RegularExpressions;
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
        public bool IsDeleteMode { get; set; } = false; // Controls UI state
    }

    partial class Program
    {
        public static Dictionary<ulong, UserState> ActiveSessions = new Dictionary<ulong, UserState>();
        public static readonly HttpClient HttpClient = new HttpClient();

        // Config
        public const string PROJECT_ID = "ordo-continuum-dossiers";
        public const string APP_ID = "ordo-continuum-v12";
        public const string API_KEY = "AIzaSyB1gqid0rb9K-z0lKNTpyKiFpOKUl7ffrM";

        // Constants
        public static readonly string[] ATTRIBUTES = { "str", "dex", "con", "int", "wis", "cha" };
        public static readonly (string key, string name, string attr)[] SKILLS = {
            ("athletics", "Атлетика", "str"), ("acrobatics", "Акробатика", "dex"), ("sleight", "Ловкость рук", "dex"), ("stealth", "Скрытность", "dex"),
            ("history", "История", "int"), ("investigation", "Расследование", "int"), ("tech", "Техника", "int"), ("programming", "Программирование", "int"),
            ("fund_science", "Фун. Науки", "int"), ("weapons", "Оружие", "int"), ("nature", "Природа", "int"), ("religion", "Религия", "int"),
            ("perception", "Восприятие", "wis"), ("survival", "Выживание", "wis"), ("medicine", "Медицина", "wis"), ("insight", "Проницательность", "wis"),
            ("performance", "Выступление", "cha"), ("intimidation", "Запугивание", "cha"), ("deception", "Обман", "cha"), ("persuasion", "Убеждение", "cha")
        };

        static void Main(string[] args) => new Program().MainAsync().GetAwaiter().GetResult();

        public async Task MainAsync()
        {
            Console.WriteLine(">>> STARTING ORDO BOT V3.7 (SINGLE MESSAGE MODE)...");

            string envPath = FindEnvFile();
            if (!string.IsNullOrEmpty(envPath)) Env.Load(envPath);

            var token = Environment.GetEnvironmentVariable("DISCORD_TOKEN");
            if (string.IsNullOrWhiteSpace(token)) { Console.WriteLine("CRITICAL: DISCORD_TOKEN missing."); return; }

            var discord = new DiscordClient(new DiscordConfiguration()
            {
                Token = token,
                TokenType = TokenType.Bot,
                Intents = DiscordIntents.All,
                AutoReconnect = true,
                MinimumLogLevel = LogLevel.Information
            });

            discord.UseInteractivity(new InteractivityConfiguration() { Timeout = TimeSpan.FromMinutes(15) });

            var commands = discord.UseCommandsNext(new CommandsNextConfiguration() { StringPrefixes = new[] { "!" }, EnableDms = true, EnableMentionPrefix = true });
            commands.RegisterCommands<DossierCommands>();

            var slash = discord.UseSlashCommands();
            slash.RegisterCommands<DossierSlashCommands>();

            discord.ComponentInteractionCreated += OnComponentInteraction;
            discord.ModalSubmitted += OnModalSubmitted;

            await discord.ConnectAsync();
            await Task.Delay(-1);
        }

        public static string ExtractId(string input)
        {
            if (string.IsNullOrEmpty(input)) return "";
            input = input.Trim();
            if (input.Contains("/dossier/")) return input.Split(new[] { "/dossier/" }, StringSplitOptions.None)[1].Split('?')[0];
            return input;
        }

        // --- INTERACTION HANDLER ---
        private async Task OnComponentInteraction(DiscordClient sender, ComponentInteractionCreateEventArgs e)
        {
            if (!ActiveSessions.ContainsKey(e.Message.Id))
            {
                // Try to recover if it's a known interaction on an old message, but usually we just fail gracefully
                await e.Interaction.CreateResponseAsync(InteractionResponseType.ChannelMessageWithSource, new DiscordInteractionResponseBuilder().WithContent("⚠️ Session expired. Please run /dossier again.").AsEphemeral(true));
                return;
            }

            var state = ActiveSessions[e.Message.Id];
            
            try 
            {
                // --- TAB SWITCHING (Seamless Update) ---
                if (e.Id.StartsWith("tab_"))
                {
                    // Crucial: Use DeferredMessageUpdate to keep the SAME message
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);

                    // 1. RE-FETCH DATA FROM DB
                    var (freshData, _) = await FirestoreHelper.FetchProtocolData(state.CharId);
                    if (freshData != null) state.Data = freshData;

                    state.CurrentTab = e.Id.Replace("tab_", "");
                    state.IsDeleteMode = false; // Reset delete mode on tab switch
                    
                    var (embed, components, attachment) = BuildInterface(state);
                    
                    var builder = new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components);
                    if (attachment != null) builder.AddFile("profile.png", attachment);

                    await e.Interaction.EditOriginalResponseAsync(builder);
                }
                // --- ENTER DELETE MODE (Seamless) ---
                else if (e.Id == "btn_delete_mode")
                {
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                    state.IsDeleteMode = true; // Set flag
                    
                    var (embed, components, _) = BuildInterface(state);
                    await e.Interaction.EditOriginalResponseAsync(new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components));
                }
                // --- CANCEL DELETE (Seamless) ---
                else if (e.Id == "btn_delete_cancel")
                {
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);
                    state.IsDeleteMode = false; // Clear flag
                    
                    var (embed, components, attachment) = BuildInterface(state);
                    var builder = new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components);
                    if (attachment != null) builder.AddFile("profile.png", attachment);
                    
                    await e.Interaction.EditOriginalResponseAsync(builder);
                }
                // --- EXECUTE DELETE (Seamless) ---
                else if (e.Id == "menu_delete")
                {
                    var selectedId = e.Values.FirstOrDefault(); 
                    if (selectedId != null)
                    {
                        await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);

                        var parts = selectedId.Split(':');
                        var type = parts[0];
                        var index = int.Parse(parts[1]);
                        string path = FirestoreHelper.GetPathByType(type);
                        
                        FirestoreHelper.RemoveItemFromArray(state.Data, path, index);
                        await FirestoreHelper.SyncArray(state.CharId, state.IsResistance, state.Data, path);

                        // Return to normal mode after delete
                        state.IsDeleteMode = false; 

                        var (embed, components, attachment) = BuildInterface(state);
                        var builder = new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components);
                        if (attachment != null) builder.AddFile("profile.png", attachment);

                        await e.Interaction.EditOriginalResponseAsync(builder);
                    }
                }
                // --- MODALS (These require a Modal response, not an Update) ---
                else if (e.Id == "btn_edit_vitals")
                {
                    var hp = FirestoreHelper.GetField(state.Data, "stats.mapValue.fields.hp_curr") ?? "0";
                    var temp = FirestoreHelper.GetField(state.Data, "stats.mapValue.fields.hp_temp") ?? "0";
                    var shield = FirestoreHelper.GetField(state.Data, "stats.mapValue.fields.shield_curr") ?? "0";
                    var modal = new DiscordInteractionResponseBuilder().WithTitle("EDIT VITALS").WithCustomId($"modal_vitals_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("Current HP", "hp_curr", "Value", hp, min_length: 1, max_length: 4))
                        .AddComponents(new TextInputComponent("Temp HP", "hp_temp", "Value (0 to clear)", temp, required: false))
                        .AddComponents(new TextInputComponent("Shields", "shield_curr", "Value (0 to clear)", shield, required: false));
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                else if (e.Id == "btn_edit_money")
                {
                    var m = state.Data["fields"]?["money"]?["mapValue"]?["fields"];
                    var u = m?["u"]?["stringValue"]?.ToString() ?? "0";
                    var k = m?["k"]?["stringValue"]?.ToString() ?? "0";
                    var mega = m?["m"]?["stringValue"]?.ToString() ?? "0";
                    var g = m?["g"]?["stringValue"]?.ToString() ?? "0";

                    var modal = new DiscordInteractionResponseBuilder().WithTitle("EDIT FINANCES").WithCustomId($"modal_money_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("U-Credits", "u", "Value", u))
                        .AddComponents(new TextInputComponent("K-Credits", "k", "Value", k))
                        .AddComponents(new TextInputComponent("M-Credits", "m", "Value", mega))
                        .AddComponents(new TextInputComponent("G-Credits", "g", "Value", g));
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                 else if (e.Id == "btn_edit_psi")
                {
                    var curr = FirestoreHelper.GetField(state.Data, "psionics.mapValue.fields.points_curr") ?? "0";
                    var modal = new DiscordInteractionResponseBuilder().WithTitle("PSI POINTS").WithCustomId($"modal_psi_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("Current Psi Points", "val", "Value", curr));
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                else if (e.Id == "btn_add_item")
                {
                    var modal = new DiscordInteractionResponseBuilder().WithTitle("ADD NEW ENTRY").WithCustomId($"modal_add_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("Type (inventory, weapons, features, counters)", "type", "Type code", "inventory"))
                        .AddComponents(new TextInputComponent("Name", "name", "Item Name"))
                        .AddComponents(new TextInputComponent("Desc / Value / Dmg", "desc", "Description, Dmg or Value"));
                    
                    await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                else if (e.Id == "btn_edit_counters")
                {
                     var modal = new DiscordInteractionResponseBuilder().WithTitle("EDIT COUNTER").WithCustomId($"modal_counter_{e.Message.Id}")
                        .AddComponents(new TextInputComponent("Counter Name (Exact Match)", "name", "Name of existing counter"))
                        .AddComponents(new TextInputComponent("New Value", "val", "Number"));
                     await e.Interaction.CreateResponseAsync(InteractionResponseType.Modal, modal);
                }
                // --- INSPECT (Ephemeral Only) ---
                else if (e.Id == "menu_inspect")
                {
                    // Inspect creates a NEW ephemeral message (as it's temporary info), doesn't update the main UI
                    var selectedId = e.Values.FirstOrDefault();
                    if (selectedId != null)
                    {
                        var parts = selectedId.Split(':');
                        var type = parts[0];
                        var idx = int.Parse(parts[1]);
                        var desc = FirestoreHelper.GetItemDescription(state.Data, type, idx);
                        await e.Interaction.CreateResponseAsync(InteractionResponseType.ChannelMessageWithSource, new DiscordInteractionResponseBuilder().WithContent(desc).AsEphemeral(true));
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Interaction Error: {ex}");
                // Try to alert user if possible
                try { await e.Interaction.CreateFollowupMessageAsync(new DiscordFollowupMessageBuilder().WithContent("❌ Error processing request.").AsEphemeral(true)); } catch {}
            }
        }

        // --- MODAL HANDLER ---
        private async Task OnModalSubmitted(DiscordClient sender, ModalSubmitEventArgs e)
        {
            var parts = e.Interaction.Data.CustomId.Split('_'); // modal_type_id
            if (parts.Length < 3 || !ulong.TryParse(parts[2], out ulong msgId)) return;
            if (!ActiveSessions.ContainsKey(msgId)) return;

            var state = ActiveSessions[msgId];
            
            // Critical: Update the EXISTING message after modal submit
            await e.Interaction.CreateResponseAsync(InteractionResponseType.DeferredMessageUpdate);

            try
            {
                if (parts[1] == "vitals")
                {
                    var hp = e.Values["hp_curr"];
                    var temp = e.Values["hp_temp"];
                    var shield = e.Values["shield_curr"];
                    
                    FirestoreHelper.SetField(state.Data, "stats.mapValue.fields.hp_curr", hp);
                    FirestoreHelper.SetField(state.Data, "stats.mapValue.fields.hp_temp", temp);
                    FirestoreHelper.SetField(state.Data, "stats.mapValue.fields.shield_curr", shield);

                    var updates = new Dictionary<string, object> {
                        { "fields.stats.mapValue.fields.hp_curr.integerValue", hp },
                        { "fields.stats.mapValue.fields.hp_temp.integerValue", temp },
                        { "fields.stats.mapValue.fields.shield_curr.integerValue", shield }
                    };
                    await FirestoreHelper.PatchFields(state.CharId, state.IsResistance, updates);
                }
                else if (parts[1] == "money")
                {
                    var m = new Dictionary<string, string> { {"u", e.Values["u"]}, {"k", e.Values["k"]}, {"m", e.Values["m"]}, {"g", e.Values["g"]} };
                    FirestoreHelper.SetMap(state.Data, "money", m);
                    await FirestoreHelper.PatchMap(state.CharId, state.IsResistance, "money", m);
                }
                else if (parts[1] == "psi")
                {
                    var val = e.Values["val"];
                    FirestoreHelper.SetField(state.Data, "psionics.mapValue.fields.points_curr", val);
                    await FirestoreHelper.PatchFields(state.CharId, state.IsResistance, new Dictionary<string, object> { { "fields.psionics.mapValue.fields.points_curr.integerValue", val } });
                }
                else if (parts[1] == "counter")
                {
                     var name = e.Values["name"].Trim();
                     var val = e.Values["val"];
                     FirestoreHelper.UpdateCounter(state.Data, name, int.Parse(val));
                     await FirestoreHelper.SyncArray(state.CharId, state.IsResistance, state.Data, "universalis.mapValue.fields.counters");
                }
                else if (parts[1] == "add")
                {
                    var type = e.Values["type"].ToLower().Trim();
                    var name = e.Values["name"];
                    var desc = e.Values["desc"];
                    
                    string path = "";
                    JObject newItem = new JObject();
                    JObject fields = new JObject();
                    fields["name"] = new JObject { ["stringValue"] = name };

                    if (type.Contains("weapon")) {
                        path = "combat.mapValue.fields.weapons";
                        fields["type"] = new JObject { ["stringValue"] = "New" };
                        fields["dmg"] = new JObject { ["stringValue"] = desc };
                        fields["props"] = new JObject { ["stringValue"] = "" };
                    } 
                    else if (type.Contains("feat") || type.Contains("trait") || type.Contains("feature")) {
                        path = "features"; // Default to features if generic
                        if (type.Contains("trait")) path = "traits";
                        if (type.Contains("ability")) path = "abilities";
                        fields["desc"] = new JObject { ["stringValue"] = desc };
                    }
                    else if (type.Contains("counter")) {
                        path = "universalis.mapValue.fields.counters";
                        fields["val"] = new JObject { ["integerValue"] = "0" };
                        fields["max"] = new JObject { ["integerValue"] = desc };
                    }
                    else if (type.Contains("custom") || type.Contains("registry")) {
                        path = "universalis.mapValue.fields.custom_table";
                         fields["desc"] = new JObject { ["stringValue"] = desc };
                    }
                    else {
                        path = "combat.mapValue.fields.inventory"; 
                        fields["desc"] = new JObject { ["stringValue"] = desc };
                    }

                    newItem["mapValue"] = new JObject { ["fields"] = fields };
                    
                    FirestoreHelper.AddItemToArray(state.Data, path, newItem);
                    await FirestoreHelper.SyncArray(state.CharId, state.IsResistance, state.Data, path);
                }

                var (embed, components, attachment) = BuildInterface(state);
                var builder = new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components);
                if (attachment != null) builder.AddFile("profile.png", attachment);
                
                await e.Interaction.EditOriginalResponseAsync(builder);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Modal Logic Error: {ex}");
                await e.Interaction.CreateFollowupMessageAsync(new DiscordFollowupMessageBuilder().WithContent($"❌ Sync Error: {ex.Message}").AsEphemeral(true));
            }
        }

        // --- UI BUILDER ---
        public static (DiscordEmbed, List<DiscordActionRowComponent>, MemoryStream) BuildInterface(UserState state)
        {
            bool isRes = state.IsResistance;
            var data = state.Data;
            var color = isRes ? new DiscordColor(0x38ff12) : new DiscordColor(0xd4af37);

            // --- DELETE MODE UI ---
            if (state.IsDeleteMode)
            {
                var embedDel = new DiscordEmbedBuilder()
                    .WithTitle("⚠️ DELETION MODE")
                    .WithDescription("Select an item below to **PERMANENTLY DELETE** it from the database.\nThis action cannot be undone.")
                    .WithColor(DiscordColor.Red);

                var options = GetInspectOptions(state);
                var rowsDel = new List<DiscordActionRowComponent>();

                if (options.Count > 0)
                {
                    var dropdown = new DiscordSelectComponent("menu_delete", "Select item to DELETE...", options.Take(25).ToList());
                    rowsDel.Add(new DiscordActionRowComponent(new[] { dropdown }));
                }
                else
                {
                    embedDel.WithDescription("No items found in this category to delete.");
                }

                rowsDel.Add(new DiscordActionRowComponent(new[] {
                    new DiscordButtonComponent(ButtonStyle.Secondary, "btn_delete_cancel", "Cancel / Go Back")
                }));

                return (embedDel.Build(), rowsDel, null);
            }

            // --- NORMAL UI ---
            var btnStyle = isRes ? ButtonStyle.Success : ButtonStyle.Primary;

            var name = FirestoreHelper.GetField(data, "meta.mapValue.fields.name") ?? "Unknown";
            var imgStr = FirestoreHelper.GetField(data, "meta.mapValue.fields.image");
            MemoryStream imgStream = null;
            
            var embed = new DiscordEmbedBuilder()
                .WithTitle(isRes ? $"// {name.ToUpper()}" : $"PROTOCOL: {name.ToUpper()}")
                .WithColor(color);

            // Handle Image (Base64 or URL)
            if (!string.IsNullOrEmpty(imgStr))
            {
                if (imgStr.StartsWith("http"))
                {
                    embed.WithThumbnail(imgStr);
                }
                else if (imgStr.StartsWith("data:image"))
                {
                    try
                    {
                        var base64Data = imgStr.Split(',')[1];
                        var bytes = Convert.FromBase64String(base64Data);
                        imgStream = new MemoryStream(bytes);
                        embed.WithThumbnail("attachment://profile.png");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Image conversion failed: " + ex.Message);
                    }
                }
            }

            int level = int.Parse(FirestoreHelper.GetField(data, "meta.mapValue.fields.level") ?? "1");
            int pb = 2 + (level - 1) / 4;
            
            switch (state.CurrentTab)
            {
                case "identity":
                    embed.WithDescription($"**ID:** {state.CharId}");
                    embed.AddField("Identity", 
                        $"**Name:** {name}\n" +
                        $"**Class:** {FirestoreHelper.GetField(data, "meta.mapValue.fields.class")}\n" +
                        $"**Level:** {level} (PB: +{pb})\n" +
                        $"**Race:** {FirestoreHelper.GetField(data, "meta.mapValue.fields.race")}\n" +
                        $"**Origin:** {FirestoreHelper.GetField(data, "meta.mapValue.fields.origin") ?? "N/A"}", false);
                    embed.AddField("Rank", FirestoreHelper.GetField(data, "meta.mapValue.fields.rank") ?? "N/A", true);
                    embed.AddField("Archetype", FirestoreHelper.GetField(data, "meta.mapValue.fields.archetype") ?? "N/A", true);
                    break;

                case "stats":
                    var spd = FirestoreHelper.GetField(data, "stats.mapValue.fields.speed") ?? "0";
                    var hp = FirestoreHelper.GetField(data, "stats.mapValue.fields.hp_curr") ?? "0";
                    var hpMax = FirestoreHelper.GetField(data, "stats.mapValue.fields.hp_max") ?? "0";
                    var hpTemp = FirestoreHelper.GetField(data, "stats.mapValue.fields.hp_temp") ?? "0";
                    var shields = FirestoreHelper.GetField(data, "stats.mapValue.fields.shield_curr") ?? "0";
                    
                    embed.AddField("Vitals", $"**HP:** {hp} / {hpMax} (Temp: {hpTemp})\n**Shields:** {shields}", true);
                    
                    int wis = int.Parse(FirestoreHelper.GetField(data, "stats.mapValue.fields.wis") ?? "10");
                    int wisMod = (wis - 10) / 2;
                    bool profPer = FirestoreHelper.GetSkillState(data, "perception").isProf;
                    bool expPer = FirestoreHelper.GetSkillState(data, "perception").isExp;
                    int ppMod = int.Parse(FirestoreHelper.GetField(data, "stats.mapValue.fields.passive_perception_mod") ?? "0");
                    int pp = 10 + wisMod + (expPer ? pb*2 : profPer ? pb : 0) + ppMod;

                    embed.AddField("Sensors & Mobility", $"**Speed:** {spd}m\n**Passive Perception:** {pp}", true);

                    string savesStr = "";
                    foreach(var a in ATTRIBUTES)
                    {
                        bool isProf = FirestoreHelper.GetBool(data, $"saves.mapValue.fields.prof_{a}");
                        savesStr += $"{(isProf ? "✅" : "⬛")} {a.ToUpper()}\n";
                    }
                    embed.AddField("Save Proficiencies", savesStr, false);

                    var attrStr = "";
                    foreach(var a in ATTRIBUTES)
                    {
                        var val = int.Parse(FirestoreHelper.GetField(data, $"stats.mapValue.fields.{a}") ?? "10");
                        var mod = (val - 10) / 2;
                        attrStr += $"**{a.ToUpper()}:** {val} ({(mod>=0?"+":"")}{mod})\n";
                    }
                    embed.AddField("Attributes", attrStr, false);
                    break;

                case "skills":
                {
                    var sb = new StringBuilder();
                    sb.Append("```");
                    foreach(var s in SKILLS)
                    {
                        var st = FirestoreHelper.GetSkillState(data, s.key);
                        var attrVal = int.Parse(FirestoreHelper.GetField(data, $"stats.mapValue.fields.{s.attr}") ?? "10");
                        var mod = (attrVal - 10) / 2;
                        var total = mod + st.bonus + (st.isExp ? pb*2 : st.isProf ? pb : 0);
                        
                        string mark = st.isExp ? "!!" : st.isProf ? "! " : "  ";
                        sb.AppendLine($"{mark}{s.name.PadRight(18)}: {(total>=0?"+":"")}{total}");
                    }
                    sb.Append("```");
                    embed.WithDescription(sb.ToString());
                    break;
                }

                case "gear":
                    var money = data["fields"]?["money"]?["mapValue"]?["fields"];
                    embed.AddField("Finances", 
                        $"**U:** {money?["u"]?["stringValue"] ?? "0"} | **K:** {money?["k"]?["stringValue"] ?? "0"} | **M:** {money?["m"]?["stringValue"] ?? "0"} | **G:** {money?["g"]?["stringValue"] ?? "0"}", false);
                    
                    var weapons = FirestoreHelper.GetArray(data, "combat.mapValue.fields.weapons");
                    var wStr = new StringBuilder();
                    if(weapons.Count == 0) wStr.Append("No weapons.");
                    foreach(var w in weapons)
                    {
                         var n = w["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                         var d = w["mapValue"]?["fields"]?["dmg"]?["stringValue"]?.ToString();
                         wStr.AppendLine($"• **{n}** ({d})");
                    }
                    embed.AddField("Weapons", wStr.ToString());

                    var inv = FirestoreHelper.GetArray(data, "combat.mapValue.fields.inventory");
                    var iStr = new StringBuilder();
                    if(inv.Count == 0) iStr.Append("Empty.");
                    int count = 0;
                    foreach(var i in inv) {
                        if (count++ > 15) { iStr.AppendLine("...and more"); break; }
                        var n = i["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                        iStr.AppendLine($"• {n}");
                    }
                    embed.AddField("Inventory", iStr.ToString());
                    break;

                case "feats":
                    var traits = FirestoreHelper.GetArray(data, "traits");
                    var features = FirestoreHelper.GetArray(data, "features");
                    var abilities = FirestoreHelper.GetArray(data, "abilities");
                    
                    embed.AddField("Traits & Features", FormatList(traits.Concat(features)), false);
                    embed.AddField("Abilities", FormatList(abilities), false);

                    var profs = FirestoreHelper.GetArray(data, "profs.mapValue.fields.armory")
                        .Concat(FirestoreHelper.GetArray(data, "profs.mapValue.fields.tools"));
                    
                    var profSb = new StringBuilder();
                    foreach(var p in profs) profSb.Append((p["stringValue"]?.ToString() ?? "") + ", ");
                    embed.AddField("Proficiencies", profSb.Length > 0 ? profSb.ToString().TrimEnd(',', ' ') : "None", false);
                    break;

                case "psi":
                    var psi = data["fields"]?["psionics"]?["mapValue"]?["fields"];
                    var baseAttr = psi?["base_attr"]?["stringValue"]?.ToString() ?? "int";
                    var casterType = psi?["caster_type"]?["stringValue"]?.ToString() ?? "1";
                    var curr = psi?["points_curr"]?["integerValue"]?.ToString() ?? "0";
                    var modPts = int.Parse(psi?["mod_points"]?["integerValue"]?.ToString() ?? "0");

                    double mult = casterType == "0.5" ? 3 : casterType == "0.33" ? 2 : 6;
                    int maxPts = (int)((mult + modPts) * level);

                    embed.AddField("Psionics Status", 
                        $"**Base:** {baseAttr.ToUpper()}\n" +
                        $"**Type:** {casterType}x\n" +
                        $"**Psi Points:** {curr} / {maxPts}", false);
                    
                    var spells = FirestoreHelper.GetArray(data, "psionics.mapValue.fields.spells");
                    embed.AddField("Spells Registered", $"{spells.Count} entries found. Use Inspect to view details.", false);
                    break;

                case "univ":
                {
                    var uni = data["fields"]?["universalis"]?["mapValue"]?["fields"];
                    var saveBase = int.Parse(uni?["save_base"]?["integerValue"]?.ToString() ?? "8");
                    var saveAttr = uni?["save_attr"]?["stringValue"]?.ToString() ?? "int";
                    var attrVal = int.Parse(FirestoreHelper.GetField(data, $"stats.mapValue.fields.{saveAttr}") ?? "10");
                    var saveTotal = saveBase + (attrVal-10)/2 + pb;

                    embed.AddField("Custom Save", $"**DC:** {saveTotal} (Base {saveBase} + {saveAttr.ToUpper()} + PB)", false);

                    var counters = FirestoreHelper.GetArray(data, "universalis.mapValue.fields.counters");
                    var cStr = new StringBuilder();
                    foreach(var c in counters)
                    {
                        var n = c["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                        var v = c["mapValue"]?["fields"]?["val"]?["integerValue"]?.ToString();
                        var m = c["mapValue"]?["fields"]?["max"]?["integerValue"]?.ToString();
                        cStr.AppendLine($"• **{n}**: {v} / {m}");
                    }
                    embed.AddField("Counters", cStr.Length > 0 ? cStr.ToString() : "None", false);
                    break;
                }
            }

            var rows = new List<DiscordActionRowComponent>();

            // Row 1: Main Tabs
            rows.Add(new DiscordActionRowComponent(new[] {
                new DiscordButtonComponent(btnStyle, "tab_identity", "ID", state.CurrentTab=="identity"),
                new DiscordButtonComponent(btnStyle, "tab_stats", "STATS", state.CurrentTab=="stats"),
                new DiscordButtonComponent(btnStyle, "tab_skills", "SKILLS", state.CurrentTab=="skills"),
                new DiscordButtonComponent(btnStyle, "tab_gear", "GEAR", state.CurrentTab=="gear")
            }));

            // Row 2: Extra Tabs
            rows.Add(new DiscordActionRowComponent(new[] {
                new DiscordButtonComponent(btnStyle, "tab_feats", "FEATS", state.CurrentTab=="feats"),
                new DiscordButtonComponent(btnStyle, "tab_psi", "PSI", state.CurrentTab=="psi"),
                new DiscordButtonComponent(btnStyle, "tab_univ", "UNIV", state.CurrentTab=="univ")
            }));

            // Row 3: Actions
            var actions = new List<DiscordComponent>();
            actions.Add(new DiscordButtonComponent(ButtonStyle.Secondary, "btn_edit_vitals", "Edit Vitals"));
            
            if(state.CurrentTab == "gear") actions.Add(new DiscordButtonComponent(ButtonStyle.Secondary, "btn_edit_money", "Finances"));
            if(state.CurrentTab == "psi") actions.Add(new DiscordButtonComponent(ButtonStyle.Secondary, "btn_edit_psi", "Edit Points"));
            if(state.CurrentTab == "univ") actions.Add(new DiscordButtonComponent(ButtonStyle.Secondary, "btn_edit_counters", "Set Counter"));
            
            actions.Add(new DiscordButtonComponent(ButtonStyle.Secondary, "btn_add_item", "+ Add Item"));
            actions.Add(new DiscordButtonComponent(ButtonStyle.Danger, "btn_delete_mode", "Delete Item")); // Activates Delete Mode
            rows.Add(new DiscordActionRowComponent(actions));

            // Row 4: Inspect (Still useful for details)
            var options = GetInspectOptions(state);

            if (options.Count > 0)
            {
                rows.Add(new DiscordActionRowComponent(new [] {
                    new DiscordSelectComponent("menu_inspect", "Inspect Detail...", options.Take(25).ToList())
                }));
            }

            return (embed.Build(), rows, imgStream);
        }

        // Logic refactored to share between Inspect and Delete
        private static List<DiscordSelectComponentOption> GetInspectOptions(UserState state)
        {
            var options = new List<DiscordSelectComponentOption>();
            var data = state.Data;
            
            if (state.CurrentTab == "gear") { 
                AddOptions(options, data, "combat.mapValue.fields.weapons", "weapon"); 
                AddOptions(options, data, "combat.mapValue.fields.inventory", "inventory", options.Count);
            }
            else if (state.CurrentTab == "feats") { 
                AddOptions(options, data, "features", "feat");
                AddOptions(options, data, "abilities", "ability", options.Count);
                AddOptions(options, data, "traits", "trait", options.Count);
            }
            else if (state.CurrentTab == "psi") { AddOptions(options, data, "psionics.mapValue.fields.spells", "spell"); }
            else if (state.CurrentTab == "univ") { 
                AddOptions(options, data, "universalis.mapValue.fields.custom_table", "registry");
                AddOptions(options, data, "universalis.mapValue.fields.counters", "counter", options.Count);
            }
            
            return options;
        }

        private static void AddOptions(List<DiscordSelectComponentOption> opts, JObject data, string path, string prefix, int offset = 0)
        {
            var arr = FirestoreHelper.GetArray(data, path);
            for(int i=0; i<arr.Count; i++)
            {
                var n = arr[i]["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                if(!string.IsNullOrWhiteSpace(n)) opts.Add(new DiscordSelectComponentOption(n, $"{prefix}:{i+offset}"));
            }
        }

        private static string FormatList(IEnumerable<JToken> items)
        {
            var sb = new StringBuilder();
            int c = 0;
            foreach(var i in items)
            {
                if(c++ > 15) { sb.AppendLine("...and more"); break; }
                var n = i["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString();
                if(!string.IsNullOrEmpty(n)) sb.AppendLine($"• {n}");
            }
            return sb.Length > 0 ? sb.ToString() : "None.";
        }

        private static string FindEnvFile()
        {
            try {
                var current = Directory.GetCurrentDirectory();
                while (current != null) {
                    var path = Path.Combine(current, ".env");
                    if (File.Exists(path)) return path;
                    current = Directory.GetParent(current)?.FullName;
                }
            } catch {}
            return null;
        }

        // --- SHARED SESSION FETCHER ---
        public static async Task<(UserState state, string error)> GetSessionState(string input)
        {
            string id = ExtractId(input);
            if (string.IsNullOrEmpty(id)) return (null, "⚠️ Invalid ID");

            var (data, isRes) = await FirestoreHelper.FetchProtocolData(id);
            if (data == null) return (null, "❌ Protocol not found.");

            return (new UserState { CharId = id, IsResistance = isRes, Data = data, CurrentTab = "identity" }, null);
        }
    }

    // --- SLASH COMMANDS ---
    public class DossierSlashCommands : ApplicationCommandModule
    {
        [SlashCommand("dossier", "Open Dossier")]
        public async Task GetDossier(InteractionContext ctx, [Option("id", "ID")] string input) {
            // SET EPHEMERAL HERE: This ensures the initial message is private.
            await ctx.CreateResponseAsync(InteractionResponseType.DeferredChannelMessageWithSource, new DiscordInteractionResponseBuilder().AsEphemeral(true));
            
            var (state, error) = await Program.GetSessionState(input);
            
            if (state == null) {
                await ctx.EditResponseAsync(new DiscordWebhookBuilder().WithContent(error));
                return;
            }

            var (embed, components, attachment) = Program.BuildInterface(state);
            var builder = new DiscordWebhookBuilder().AddEmbed(embed).AddComponents(components);
            if(attachment != null) builder.AddFile("profile.png", attachment);

            var msg = await ctx.EditResponseAsync(builder);
            
            if (Program.ActiveSessions.ContainsKey(msg.Id)) Program.ActiveSessions.Remove(msg.Id);
            Program.ActiveSessions.Add(msg.Id, state);
        }
    }

    // --- TEXT COMMANDS (Can't be Ephemeral in the same way, but interactions will update gracefully) ---
    public class DossierCommands : BaseCommandModule
    {
        [Command("dossier")]
        public async Task GetDossier(CommandContext ctx, [Description("ID")] string input) {
            await ctx.TriggerTypingAsync();
            
            var (state, error) = await Program.GetSessionState(input);
            
            if (state == null) {
                await ctx.RespondAsync(error);
                return;
            }

            var (embed, components, attachment) = Program.BuildInterface(state);
            var builder = new DiscordMessageBuilder().AddEmbed(embed).AddComponents(components);
            if(attachment != null) builder.AddFile("profile.png", attachment);

            var msg = await ctx.RespondAsync(builder);
            
            if (Program.ActiveSessions.ContainsKey(msg.Id)) Program.ActiveSessions.Remove(msg.Id);
            Program.ActiveSessions.Add(msg.Id, state);
        }
    }

    // --- FIRESTORE HELPER ---
    public static class FirestoreHelper
    {
        // FIX: Clean mask path generator
        private static string GetCleanPath(string path)
        {
            if (path.StartsWith("fields.")) path = path.Substring(7);
            
            path = path.Replace(".integerValue", "")
                       .Replace(".stringValue", "")
                       .Replace(".booleanValue", "")
                       .Replace(".doubleValue", "")
                       .Replace(".arrayValue", "")
                       .Replace(".mapValue.fields", ""); 
                       
            return path;
        }

        public static string GetPathByType(string type)
        {
            if (type == "weapon") return "combat.mapValue.fields.weapons";
            if (type == "inventory") return "combat.mapValue.fields.inventory";
            if (type == "spell") return "psionics.mapValue.fields.spells";
            if (type == "registry") return "universalis.mapValue.fields.custom_table";
            if (type == "counter") return "universalis.mapValue.fields.counters";
            if (type == "feat") return "features";
            if (type == "ability") return "abilities";
            if (type == "trait") return "traits";
            return "";
        }

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
            return current["stringValue"]?.ToString() ?? current["integerValue"]?.ToString() ?? current["doubleValue"]?.ToString();
        }

        public static bool GetBool(JObject root, string path)
        {
             JToken current = root["fields"];
             if (current == null) return false;
             foreach (var part in path.Split('.')) {
                current = current[part];
                if (current == null) return false;
             }
             return current["booleanValue"]?.ToObject<bool>() ?? false;
        }

        public static JArray GetArray(JObject root, string path)
        {
            JToken current = root["fields"];
            if (current == null) return new JArray();
            foreach (var part in path.Split('.')) {
                current = current[part];
                if (current == null) return new JArray();
            }
            return (JArray)(current["arrayValue"]?["values"]) ?? new JArray();
        }

        public static void RemoveItemFromArray(JObject root, string path, int index)
        {
            var arr = GetArray(root, path);
            if (index >= 0 && index < arr.Count)
            {
                arr.RemoveAt(index);
            }
        }

        public static (bool isProf, bool isExp, int bonus) GetSkillState(JObject data, string skill)
        {
            var skills = data["fields"]?["skills"]?["mapValue"]?["fields"]?["data"]?["mapValue"]?["fields"];
            if (skills == null || skills[skill] == null) return (false, false, 0);
            
            var tuple = skills[skill]?["arrayValue"]?["values"] as JArray;
            if (tuple == null || tuple.Count < 3) return (false, false, 0);

            return (
                tuple[0]["booleanValue"]?.ToObject<bool>() ?? false,
                tuple[1]["booleanValue"]?.ToObject<bool>() ?? false,
                int.Parse(tuple[2]["integerValue"]?.ToString() ?? "0")
            );
        }

        public static void SetField(JObject root, string path, string value)
        {
            JToken current = root["fields"];
            var parts = path.Split('.');
            foreach (var part in parts)
            {
                if (current[part] == null) current[part] = new JObject();
                current = current[part];
            }
            if (current["integerValue"] != null) current["integerValue"] = value;
            else current["stringValue"] = value;
        }

        public static void SetMap(JObject root, string path, Dictionary<string, string> values)
        {
             var target = root["fields"]?[path]?["mapValue"]?["fields"];
             if(target == null) return;
             foreach(var kv in values)
             {
                 if(target[kv.Key] != null) target[kv.Key]["stringValue"] = kv.Value;
             }
        }
        
        public static void UpdateCounter(JObject root, string name, int val)
        {
            var arr = GetArray(root, "universalis.mapValue.fields.counters");
            foreach(var c in arr)
            {
                if(c["mapValue"]?["fields"]?["name"]?["stringValue"]?.ToString() == name)
                {
                    c["mapValue"]["fields"]["val"]["integerValue"] = val.ToString();
                    return;
                }
            }
        }

        public static void AddItemToArray(JObject root, string path, JObject item)
        {
            JToken current = root["fields"];
            foreach (var part in path.Split('.')) current = current[part];
            
            if(current["arrayValue"] == null) current["arrayValue"] = new JObject();
            if(current["arrayValue"]["values"] == null) current["arrayValue"]["values"] = new JArray();
            
            ((JArray)current["arrayValue"]["values"]).Add(item);
        }

        public static string GetItemDescription(JObject data, string type, int index)
        {
            string path = GetPathByType(type);
            var arr = GetArray(data, path);
            if (index >= arr.Count) return "Item not found (Index mismatch).";

            var item = arr[index]["mapValue"]?["fields"];
            if (item == null) return "No data.";

            var sb = new StringBuilder();
            sb.AppendLine($"**{item["name"]?["stringValue"]}**");
            
            if (type == "weapon") {
                sb.AppendLine($"Damage: {item["dmg"]?["stringValue"]}");
                sb.AppendLine($"Props: {item["props"]?["stringValue"]}");
            }
            else if (type == "spell") {
                sb.AppendLine($"Time: {item["time"]?["stringValue"]} | Range: {item["range"]?["stringValue"]}");
                sb.AppendLine($"Dur: {item["dur"]?["stringValue"]} | Cost: {item["cost"]?["integerValue"] ?? item["cost"]?["stringValue"]}");
            }
            else if (type == "counter") {
                sb.AppendLine($"Val: {item["val"]?["integerValue"]} / {item["max"]?["integerValue"]}");
            }
            
            var desc = item["desc"]?["stringValue"]?.ToString();
            if (!string.IsNullOrWhiteSpace(desc)) sb.AppendLine($"\n{desc}");

            return sb.ToString();
        }

        public static async Task<(JObject, bool)> FetchProtocolData(string id)
        {
            string urlEmp = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/public/data/protocols/{id}?key={Program.API_KEY}";
            var res = await Program.HttpClient.GetAsync(urlEmp);
            if (res.IsSuccessStatusCode) return (JObject.Parse(await res.Content.ReadAsStringAsync()), false);

            string urlRes = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/resistance/data/protocols/{id}?key={Program.API_KEY}";
            res = await Program.HttpClient.GetAsync(urlRes);
            if (res.IsSuccessStatusCode) return (JObject.Parse(await res.Content.ReadAsStringAsync()), true);

            return (null, false);
        }

        public static async Task PatchFields(string id, bool isRes, Dictionary<string, object> updates)
        {
            string collection = isRes ? "resistance/data/protocols" : "public/data/protocols";
            string url = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/{collection}/{id}";
            
            // FIX: Use GetCleanPath
            var maskParts = updates.Keys.Select(k => "updateMask.fieldPaths=" + GetCleanPath(k));
            url += "?" + string.Join("&", maskParts) + "&key=" + Program.API_KEY;

            JObject body = new JObject();
            foreach(var kv in updates) {
                var parts = kv.Key.Split('.');
                JToken current = body;
                for(int i=0; i<parts.Length-1; i++) {
                    if (current[parts[i]] == null) current[parts[i]] = new JObject();
                    current = current[parts[i]];
                }
                current[parts.Last()] = JToken.FromObject(kv.Value);
            }

            var content = new StringContent(body.ToString(), Encoding.UTF8, "application/json");
            var response = await Program.HttpClient.PatchAsync(url, content);
            
            if(!response.IsSuccessStatusCode) {
                string err = await response.Content.ReadAsStringAsync();
                throw new Exception($"Patch Failed {response.StatusCode}: {err}");
            }
        }

        public static async Task PatchMap(string id, bool isRes, string mapName, Dictionary<string, string> values)
        {
            var updates = new Dictionary<string, object>();
            foreach(var kv in values) {
                updates[$"fields.{mapName}.mapValue.fields.{kv.Key}.stringValue"] = kv.Value;
            }
            await PatchFields(id, isRes, updates);
        }

        public static async Task SyncArray(string id, bool isRes, JObject fullData, string arrayPath)
        {
            var arr = GetArray(fullData, arrayPath);
            string collection = isRes ? "resistance/data/protocols" : "public/data/protocols";
            string url = $"https://firestore.googleapis.com/v1/projects/{Program.PROJECT_ID}/databases/(default)/documents/artifacts/{Program.APP_ID}/{collection}/{id}";
            
            // FIX: Use GetCleanPath
            url += $"?updateMask.fieldPaths={GetCleanPath(arrayPath)}&key={Program.API_KEY}";

            JObject root = new JObject();
            JObject f = new JObject();
            root["fields"] = f;
            
            JToken ptr = f;
            var pathParts = arrayPath.Split('.'); 
            
            for(int i=0; i<pathParts.Length - 1; i++) {
                 ptr[pathParts[i]] = new JObject();
                 ptr = ptr[pathParts[i]];
            }
            
            JObject av = new JObject();
            av["values"] = arr;
            JObject arrayContainer = new JObject();
            arrayContainer["arrayValue"] = av;
            
            ptr[pathParts.Last()] = arrayContainer;

            var content = new StringContent(root.ToString(), Encoding.UTF8, "application/json");
            var response = await Program.HttpClient.PatchAsync(url, content);
            
            if(!response.IsSuccessStatusCode) {
                string err = await response.Content.ReadAsStringAsync();
                throw new Exception($"SyncArray Failed {response.StatusCode}: {err}");
            }
        }
    }
}

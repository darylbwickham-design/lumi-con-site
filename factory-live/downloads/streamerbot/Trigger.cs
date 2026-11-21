using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // Change for each action. Preset names are listed in README.md.
    private const string Preset = "hog-swarm";
    // For a specific creature, set Mob to the endpoint name and Quantity to the count.
    // Leave Mob empty to use Preset.
    private const string Mob = "";
    private const int Quantity = 1;
    // For a moderator !chaos action only: use the number in chat instead of the reward multiplier.
    private const bool UseChatMultiplier = false;
    private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false })
        { Timeout = TimeSpan.FromSeconds(3) };

    public bool Execute()
    {
        try
        {
            int multiplier = CPH.GetGlobalVar<int?>("FactoryLiveMultiplier", true) ?? 1;
            if (UseChatMultiplier)
            {
                CPH.TryGetArg("rawInput", out string raw);
                if (!int.TryParse((raw ?? "").Trim(), out multiplier)) multiplier = 1;
                multiplier = Math.Max(1, Math.Min(100, multiplier));
            }
            string directory = Environment.GetEnvironmentVariable("FACTORYLIVE_CHAOS_HOME");
            if (string.IsNullOrEmpty(directory)) directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FactoryLiveChaos");
            var link = JObject.Parse(File.ReadAllText(Path.Combine(directory, "link.json")));
            string route = Mob.Length == 0 ? "/v1/trigger" : "/v1/mobs/" + Uri.EscapeDataString(Mob);
            var payload = Mob.Length == 0 ? new JObject { ["preset"] = Preset } : new JObject { ["qty"] = Quantity };
            payload["multiplier"] = multiplier;
            if (CPH.TryGetArg("redemptionId", out string id) && !string.IsNullOrEmpty(id)) payload["eventId"] = id;
            using (var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:" + (int)link["port"] + route))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", (string)link["webhookToken"]);
                request.Content = new StringContent(payload.ToString(), Encoding.UTF8, "application/json");
                using (var response = Client.SendAsync(request).GetAwaiter().GetResult())
                {
                    string result = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    CPH.SetArgument("factoryLiveResult", result);
                    CPH.SetArgument("factoryLiveStatus", (int)response.StatusCode);
                    if (!response.IsSuccessStatusCode) CPH.LogWarn("Factory Live rejected the event (" + (int)response.StatusCode + "): " + result);
                    return response.IsSuccessStatusCode;
                }
            }
        }
        catch (Exception ex) { CPH.LogError("Factory Live request failed: " + ex.GetType().Name); return false; }
    }
}

using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // Set this to a preset from bridge.config.json for each action.
    private const string Preset = "turn-around";
    // Set Mob to a name from MOB-ENDPOINTS.md to spawn that creature instead.
    private const string Mob = "";
    private const int Quantity = 1;
    private const int Multiplier = 1;
    private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false })
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    public bool Execute()
    {
        try
        {
            string directory = Environment.GetEnvironmentVariable("FACTORYLIVE_CHAOS_HOME");
            if (string.IsNullOrEmpty(directory))
                directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FactoryLiveChaos");

            var link = JObject.Parse(File.ReadAllText(Path.Combine(directory, "link.json")));
            int port = (int)link["port"];
            string token = (string)link["webhookToken"];
            string route = Mob.Length == 0 ? "/v1/trigger" : "/v1/mobs/" + Uri.EscapeDataString(Mob);
            var payload = Mob.Length == 0 ? new JObject { ["preset"] = Preset } : new JObject { ["qty"] = Quantity };
            if (Multiplier != 1) payload["multiplier"] = Multiplier;
            if (CPH.TryGetArg<string>("redemptionId", out var id) && !string.IsNullOrEmpty(id))
                payload["eventId"] = id;
            using (var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:" + port + route))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                request.Content = new StringContent(payload.ToString(), Encoding.UTF8, "application/json");
                using (var response = Client.SendAsync(request).GetAwaiter().GetResult())
                {
                    string result = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    CPH.SetArgument("factoryLiveResult", result);
                    CPH.SetArgument("factoryLiveStatus", (int)response.StatusCode);
                    if (!response.IsSuccessStatusCode)
                        CPH.LogWarn("Factory Live rejected the event (" + (int)response.StatusCode + "). " + result);
                    return response.IsSuccessStatusCode;
                }
            }
        }
        catch (Exception ex)
        {
            CPH.LogError("Factory Live request failed: " + ex.GetType().Name);
            return false;
        }
    }
}

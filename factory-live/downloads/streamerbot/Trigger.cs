using System;
using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // Use one route and its matching JSON body. See the examples in README.md.
    private static readonly string Route = "/v1/trigger";
    private const string Body = "{\"preset\":\"hog-swarm\"}";
    private static readonly string Multiplier = "stream"; // "stream", "chat", or "fixed"
    private const int FixedMultiplier = 1;

    private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false })
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    public bool Execute()
    {
        try
        {
            var payload = JObject.Parse(Body);
            if (Route != "/v1/hooks/pioneer-pop")
            {
                int multiplier = FixedMultiplier;
                if (Multiplier == "stream")
                    multiplier = Math.Max(1, Math.Min(16, CPH.GetGlobalVar<int?>("FactoryLiveMultiplier", true) ?? 1));
                if (Multiplier == "chat")
                {
                    CPH.TryGetArg("rawInput", out string raw);
                    if (!int.TryParse((raw ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out multiplier))
                        multiplier = 1;
                    multiplier = Math.Max(1, Math.Min(100, multiplier));
                }
                if (payload["multiplier"] == null)
                    payload["multiplier"] = multiplier;
            }
            if (CPH.TryGetArg("redemptionId", out string id) && !string.IsNullOrEmpty(id))
                payload["eventId"] = id;

            string directory = Environment.GetEnvironmentVariable("FACTORYLIVE_CHAOS_HOME");
            if (string.IsNullOrEmpty(directory))
                directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FactoryLiveChaos");
            var link = JObject.Parse(File.ReadAllText(Path.Combine(directory, "link.json")));
            using (var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:" + (int)link["port"] + Route))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", (string)link["webhookToken"]);
                request.Content = new StringContent(payload.ToString(), Encoding.UTF8, "application/json");
                using (var response = Client.SendAsync(request).GetAwaiter().GetResult())
                {
                    string result = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    CPH.SetArgument("factoryLiveResult", result);
                    CPH.SetArgument("factoryLiveStatus", (int)response.StatusCode);
                    if (!response.IsSuccessStatusCode)
                        CPH.LogWarn("Factory Live rejected the request (" + (int)response.StatusCode + "): " + result);
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

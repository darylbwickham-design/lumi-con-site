using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false })
        { Timeout = TimeSpan.FromSeconds(3) };
    public bool Execute()
    {
        try
        {
            string directory = Environment.GetEnvironmentVariable("FACTORYLIVE_CHAOS_HOME");
            if (string.IsNullOrEmpty(directory)) directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FactoryLiveChaos");
            var link = JObject.Parse(File.ReadAllText(Path.Combine(directory, "link.json")));
            using (var request = new HttpRequestMessage(HttpMethod.Get, "http://127.0.0.1:" + (int)link["port"] + "/v1/connection"))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", (string)link["webhookToken"]);
                using (var response = Client.SendAsync(request).GetAwaiter().GetResult())
                {
                    if (!response.IsSuccessStatusCode) return false;
                    var body = JObject.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
                    string id = (string)body["pioneerDeathId"];
                    if (string.IsNullOrEmpty(id)) return true;
                    string last = CPH.GetGlobalVar<string>("FactoryLiveLastDeathId", true);
                    if (id == last) return true;
                    CPH.SetGlobalVar("FactoryLiveLastDeathId", id, true);
                    int count = (CPH.GetGlobalVar<int?>("FactoryLiveDeaths", true) ?? 0) + 1;
                    CPH.SetGlobalVar("FactoryLiveDeaths", count, true);
                    CPH.SendMessage("the pioneer has died " + count + " times", true, true);
                    return true;
                }
            }
        }
        catch { return false; } // Game or bridge may simply be closed.
    }
}

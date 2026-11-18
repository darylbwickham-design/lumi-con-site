using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // Set this to a preset from bridge.config.json for each action.
    private const string Preset = "cluster-rain";
    private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false })
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    public bool Execute()
    {
        try
        {
            string directory = Environment.GetEnvironmentVariable("FACTORYLIVE_HOME");
            if (string.IsNullOrEmpty(directory))
                directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FactoryLive");

            var link = JObject.Parse(File.ReadAllText(Path.Combine(directory, "link.json")));
            int port = (int)link["port"];
            string token = (string)link["webhookToken"];
            var payload = new JObject { ["preset"] = Preset };
            using (var request = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:" + port + "/v1/trigger"))
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

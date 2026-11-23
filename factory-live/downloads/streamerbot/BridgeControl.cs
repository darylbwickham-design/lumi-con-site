using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    // This action uses the operator token. Attach it to an owner-only trigger.
    private const string Operation = "status";

    private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseProxy = false })
    {
        Timeout = TimeSpan.FromSeconds(3)
    };

    public bool Execute()
    {
        try
        {
            var method = Operation == "status" ? HttpMethod.Get : HttpMethod.Post;
            string directory = Environment.GetEnvironmentVariable("FACTORYLIVE_CHAOS_HOME");
            if (string.IsNullOrEmpty(directory))
                directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FactoryLiveChaos");
            var link = JObject.Parse(File.ReadAllText(Path.Combine(directory, "link.json")));
            using (var request = new HttpRequestMessage(method, "http://127.0.0.1:" + (int)link["port"] + "/v1/" + Operation))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", (string)link["gameToken"]);
                using (var response = Client.SendAsync(request).GetAwaiter().GetResult())
                {
                    string result = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    CPH.SetArgument("factoryLiveResult", result);
                    CPH.SetArgument("factoryLiveStatus", (int)response.StatusCode);
                    if (response.IsSuccessStatusCode)
                        CPH.LogInfo("Factory Live " + Operation + " (" + (int)response.StatusCode + "): " + result);
                    else
                        CPH.LogWarn("Factory Live " + Operation + " failed (" + (int)response.StatusCode + "): " + result);
                    return response.IsSuccessStatusCode;
                }
            }
        }
        catch (Exception ex)
        {
            CPH.LogError("Factory Live " + Operation + " failed: " + ex.GetType().Name);
            return false;
        }
    }
}

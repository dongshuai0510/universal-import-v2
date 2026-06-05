/**
 * XHR 上传封装：监听 upload.onprogress 上报真实上传百分比。
 * 上传完成后服务端处理阶段无法获知进度，回调 percent=100 后由调用方切到
 * "处理中"不确定态。
 */
export interface UploadResult {
  ok: boolean;
  status: number;
  json: unknown;
}

export function xhrUpload(
  url: string,
  body: FormData | string,
  opts: {
    onUploadProgress?: (percent: number) => void;
    headers?: Record<string, string>;
    responseType?: "json" | "blob";
  } = {}
): Promise<UploadResult & { blob?: Blob }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (opts.headers)
      for (const [k, v] of Object.entries(opts.headers))
        xhr.setRequestHeader(k, v);
    if (opts.responseType === "blob") xhr.responseType = "blob";

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onUploadProgress)
        opts.onUploadProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (opts.responseType === "blob") {
        resolve({ ok: xhr.status < 400, status: xhr.status, json: null, blob: xhr.response });
        return;
      }
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = { error: xhr.responseText?.slice(0, 200) || "无响应" };
      }
      resolve({ ok: xhr.status < 400, status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error("网络请求失败"));
    xhr.send(body);
  });
}

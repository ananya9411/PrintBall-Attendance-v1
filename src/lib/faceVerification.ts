let faceApiPromise: Promise<any> | null = null;
const CDN = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js";
const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const MATCH_THRESHOLD = 0.52;

function loadScript() {
  if (typeof window === "undefined") throw new Error("Face verification is available in the browser only.");
  if ((window as any).faceapi) return Promise.resolve((window as any).faceapi);
  if (faceApiPromise) return faceApiPromise;
  faceApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-printball-face-api="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).faceapi));
      existing.addEventListener("error", () => reject(new Error("Could not load face verification engine.")));
      return;
    }
    const script = document.createElement("script");
    script.src = CDN;
    script.async = true;
    script.dataset.printballFaceApi = "true";
    script.onload = () => resolve((window as any).faceapi);
    script.onerror = () => reject(new Error("Could not load face verification engine. Check your internet connection."));
    document.head.appendChild(script);
  });
  return faceApiPromise;
}

async function engine() {
  const api = await loadScript();
  if (!api.nets.tinyFaceDetector.isLoaded) await api.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  if (!api.nets.faceLandmark68Net.isLoaded) await api.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  if (!api.nets.faceRecognitionNet.isLoaded) await api.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  return api;
}

async function imageFromBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function descriptor(api: any, input: HTMLImageElement) {
  return api.detectSingleFace(input, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.55 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
}

export async function verifyFaceMatch(profileUrl: string, capture: Blob) {
  const api = await engine();
  const [profile, live] = await Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not load the employee profile photo.")); image.src = profileUrl; }),
    imageFromBlob(capture),
  ]);
  const [profileResult, liveResult] = await Promise.all([descriptor(api, profile), descriptor(api, live)]);
  if (!profileResult) throw new Error("No clear face was found in the employee profile photo.");
  if (!liveResult) throw new Error("No clear face was found in the captured photo. Please retake the photo facing the camera.");
  const distance = api.euclideanDistance(profileResult.descriptor, liveResult.descriptor);
  return { matched: distance <= MATCH_THRESHOLD, distance, threshold: MATCH_THRESHOLD };
}

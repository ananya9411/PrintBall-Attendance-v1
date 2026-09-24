import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  employeeName: string;
  mode: "in" | "out";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (photo: Blob | null) => void;
};

export function AttendanceCamera({ employeeName, mode, busy, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setCamError("Camera not available. Allow camera access to take the photo.");
    }
  }, []);

  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShot({ url: URL.createObjectURL(blob), blob });
        stop();
      },
      "image/jpeg",
      0.85,
    );
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    void start();
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-ink">
        {shot ? (
          <img src={shot.url} alt="Captured photo" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full scale-x-[-1] object-cover"
          />
        )}
        {camError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-foreground">
            {camError}
          </div>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {shot
          ? `Confirm to ${mode === "in" ? "check in" : "check out"} ${employeeName}.`
          : "Look at the camera and take a photo."}
      </p>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
          <X /> Cancel
        </Button>
        {shot ? (
          <>
            <Button variant="secondary" onClick={retake} disabled={busy}>
              <RefreshCw /> Retake
            </Button>
            <Button className="flex-1" onClick={() => onConfirm(shot.blob)} disabled={busy}>
              <Check /> {mode === "in" ? "Check in" : "Check out"}
            </Button>
          </>
        ) : camError ? (
          <Button className="flex-1" onClick={() => onConfirm(null)} disabled={busy}>
            Continue without photo
          </Button>
        ) : (
          <Button className="flex-1" onClick={capture}>
            <Camera /> Take photo
          </Button>
        )}
      </div>
    </div>
  );
}

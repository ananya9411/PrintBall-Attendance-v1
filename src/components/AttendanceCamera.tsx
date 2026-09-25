import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check, ShieldCheck, LoaderCircle, CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { verifyFaceMatch } from "@/lib/faceVerification";

type Props = {
  employeeName: string;
  employeePhotoUrl: string | null;
  mode: "in" | "out";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (photo: Blob | null) => void;
};

export function AttendanceCamera({ employeeName, employeePhotoUrl, mode, busy, onCancel, onConfirm }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [verification, setVerification] = useState<"idle" | "checking" | "matched" | "failed" | "error">("idle");
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setCamError(null);
    setVerification("idle");
    setVerificationMessage(null);
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
        setVerification("idle");
        setVerificationMessage(null);
        stop();
      },
      "image/jpeg",
      0.85,
    );
  };

  const retake = () => {
    if (shot) URL.revokeObjectURL(shot.url);
    setShot(null);
    setVerification("idle");
    setVerificationMessage(null);
    void start();
  };

  const confirm = async () => {
    if (!shot) return;
    if (!employeePhotoUrl) {
      onConfirm(shot.blob);
      return;
    }
    setVerification("checking");
    setVerificationMessage("Checking the captured face against the employee profile…");
    try {
      const result = await verifyFaceMatch(employeePhotoUrl, shot.blob);
      if (!result.matched) {
        setVerification("failed");
        setVerificationMessage(`Face did not match the employee profile. Similarity distance: ${result.distance.toFixed(3)} (limit ${result.threshold.toFixed(2)}). Please retake the photo.`);
        return;
      }
      setVerification("matched");
      setVerificationMessage(`Face verified (distance ${result.distance.toFixed(3)}).`);
      onConfirm(shot.blob);
    } catch (error) {
      setVerification("error");
      setVerificationMessage(error instanceof Error ? error.message : "Face verification could not be completed.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-ink">
        {shot ? (
          <img src={shot.url} alt="Captured photo" className="h-full w-full object-cover" />
        ) : (
          <video ref={videoRef} playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
        )}
        {camError && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-foreground">{camError}</div>}
      </div>

      {employeePhotoUrl && (
        <div className={`rounded-xl border p-3 text-sm ${verification === "matched" ? "border-success/30 bg-success/5" : verification === "failed" || verification === "error" ? "border-destructive/30 bg-destructive/5" : "bg-muted/40"}`}>
          <div className="flex items-start gap-2">
            {verification === "checking" ? <LoaderCircle className="mt-0.5 size-4 animate-spin" /> : verification === "failed" || verification === "error" ? <CircleAlert className="mt-0.5 size-4 text-destructive" /> : <ShieldCheck className="mt-0.5 size-4 text-success" />}
            <div><p className="font-semibold">Face verification</p><p className="text-xs text-muted-foreground">{verificationMessage ?? "The captured face will be compared with the saved employee photo before attendance is recorded."}</p></div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {shot ? `Confirm to ${mode === "in" ? "check in" : "check out"} ${employeeName}.` : "Look at the camera and take a photo."}
      </p>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={busy || verification === "checking"}><X /> Cancel</Button>
        {shot ? (
          <>
            <Button variant="secondary" onClick={retake} disabled={busy || verification === "checking"}><RefreshCw /> Retake</Button>
            <Button className="flex-1" onClick={confirm} disabled={busy || verification === "checking"}><Check /> {verification === "checking" ? "Verifying…" : mode === "in" ? "Check in" : "Check out"}</Button>
          </>
        ) : camError ? (
          employeePhotoUrl ? (
            <Button className="flex-1" onClick={() => void start()} disabled={busy}>Retry camera</Button>
          ) : (
            <Button className="flex-1" onClick={() => onConfirm(null)} disabled={busy}>Continue without photo</Button>
          )
        ) : (
          <Button className="flex-1" onClick={capture}><Camera /> Take photo</Button>
        )}
      </div>
    </div>
  );
}

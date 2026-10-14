import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, AlertTriangle, CheckCircle2, ScanLine, X } from 'lucide-react';
import { analyzeScan, startScan } from '../../../services/scanApi';

type Phase = 'preview' | 'countdown' | 'recording' | 'uploading' | 'error';

const COUNTDOWN_FROM = 3;

const ScanCamera: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialScanId = (location.state as { scanId?: number })?.scanId ?? 0;
  const [scanId, setScanId] = useState<number>(initialScanId);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [phase, setPhase] = useState<Phase>('preview');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Initialize session if not present and start camera
  useEffect(() => {
    if (!initialScanId) {
      startScan()
        .then((res) => setScanId(res.scan_id || 1))
        .catch(() => setScanId(1));
    }
    startCamera();
    return () => stopCamera();
  }, [initialScanId]); // eslint-disable-line

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera API is not supported in this browser environment. You can upload a video file or use movement simulation.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError('Camera access denied or unavailable. You can upload a video file instead, or use simulated movement.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  // Countdown then record
  const handleStartCountdown = useCallback(() => {
    setPhase('countdown');
    let count = COUNTDOWN_FROM;
    const interval = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count === 0) {
        clearInterval(interval);
        startRecording();
      }
    }, 1000);
  }, []); // eslint-disable-line

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    let mimeType = '';
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        mimeType = 'video/webm;codecs=vp8';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      }
    }

    try {
      const mr = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setPhase('recording');
      setRecordingSeconds(0);

      // Auto-stop after 12 seconds
      let elapsed = 0;
      const ticker = setInterval(() => {
        elapsed++;
        setRecordingSeconds(elapsed);
        if (elapsed >= 12) {
          clearInterval(ticker);
          stopRecording();
        }
      }, 1000);
    } catch (err) {
      console.error('MediaRecorder start failed:', err);
      setCameraError('Unable to record camera stream. You can upload a file or use simulation.');
      setPhase('error');
    }
  };

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') return;
    mr.stop();
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      submitScan(blob);
    };
  }, []); // eslint-disable-line

  const submitScan = async (blob: Blob | null) => {
    setPhase('uploading');
    try {
      stopCamera();
      const res = await analyzeScan(scanId || 1, blob);
      const targetScanId = res?.scan_id || scanId || 1;
      navigate('/scan/processing', { state: { scanId: targetScanId } });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed. Please try again.';
      setCameraError(msg);
      setPhase('error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
  };

  const handleFileSubmit = () => {
    if (uploadFile) submitScan(uploadFile);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-brand-light tracking-widest uppercase">FORTIS SCAN</span>
          <h1 className="text-2xl font-black tracking-tight text-white mt-0.5">Movement Capture</h1>
        </div>
        <button onClick={() => navigate('/scan')} className="text-text-muted hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Camera / Preview Area */}
      <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-dark-border">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Pose guide overlay */}
        {(phase === 'preview' || phase === 'countdown') && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-brand/40 rounded-full w-24 h-48 opacity-40" />
            <div className="absolute border border-brand/20 rounded-2xl inset-8 opacity-30" />
          </div>
        )}

        {/* Countdown overlay */}
        <AnimatePresence>
          {phase === 'countdown' && (
            <motion.div
              key={countdown}
              initial={{ scale: 1.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/40"
            >
              <span className="text-9xl font-black text-brand-light drop-shadow-lg">{countdown}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording indicator */}
        {phase === 'recording' && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-white bg-black/60 px-2 py-1 rounded">
              REC {recordingSeconds}s / 12s
            </span>
          </div>
        )}

        {/* Uploading */}
        {phase === 'uploading' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-white font-semibold">Sending to Fortis Vision Engine…</span>
          </div>
        )}

        {/* Camera error fallback */}
        {cameraError && phase !== 'uploading' && (
          <div className="absolute inset-0 bg-dark-card/90 flex flex-col items-center justify-center p-6 text-center gap-4">
            <AlertTriangle className="w-10 h-10 text-warning" />
            <p className="text-sm text-text-secondary leading-relaxed">{cameraError}</p>
          </div>
        )}
      </div>

      {/* Instructions strip */}
      <div className="bg-dark-surface border border-dark-border rounded-xl px-5 py-3 flex items-center gap-3">
        <ScanLine className="w-5 h-5 text-brand-light shrink-0" />
        <p className="text-xs text-text-secondary leading-relaxed">
          {phase === 'preview' && 'Stand 2–3 m from camera. Ensure your full body is visible. Press CAPTURE when ready.'}
          {phase === 'countdown' && 'Get into position — recording starts now!'}
          {phase === 'recording' && 'Perform 3 slow bodyweight squats. Keep movement controlled.'}
          {phase === 'uploading' && 'Analysing your movement patterns with MediaPipe AI…'}
          {phase === 'error' && 'Something went wrong. You can upload a video file or use movement simulation.'}
        </p>
      </div>

      {/* Controls */}
      {(phase === 'preview' || phase === 'error') && (
        <div className="flex flex-col sm:flex-row gap-3">
          {!cameraError && (
            <button
              onClick={handleStartCountdown}
              className="fortis-btn-primary flex-1 py-3.5 font-bold flex items-center justify-center gap-2 shadow-glow"
            >
              <Camera className="w-5 h-5" />
              Capture Movement
            </button>
          )}

          {/* File upload */}
          <label className="fortis-btn-secondary flex-1 py-3.5 font-semibold flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            {uploadFile ? uploadFile.name.slice(0, 20) + '…' : 'Upload Video File'}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>

          {uploadFile && (
            <button
              onClick={handleFileSubmit}
              className="fortis-btn-primary py-3.5 px-5 font-bold flex items-center justify-center gap-2 shadow-glow"
            >
              <CheckCircle2 className="w-4 h-4" />
              Analyse Video
            </button>
          )}
        </div>
      )}

      {phase === 'recording' && (
        <button
          onClick={stopRecording}
          className="w-full py-3.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white font-bold text-sm transition-colors"
        >
          Stop Recording
        </button>
      )}
    </div>
  );
};

export default ScanCamera;

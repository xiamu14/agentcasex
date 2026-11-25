import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface BeamOptions {
  left: string;
  initialY?: number;
  translateY?: number;
  className?: string;
  duration?: number;
  delay?: number;
  repeatDelay?: number;
}

const BEAMS: BeamOptions[] = [
  { left: "2.5%", duration: 6.5, repeatDelay: 2.5, delay: 0.5 },
  { left: "6%", duration: 5, repeatDelay: 4, delay: 2.5, className: "h-10" },
  { left: "18%", duration: 8, repeatDelay: 4, delay: 1.5 },
  { left: "38%", duration: 6, repeatDelay: 5, delay: 3, className: "h-8" },
  { left: "62%", duration: 8.5, repeatDelay: 3.5, delay: 1, className: "h-16" },
  { left: "82%", duration: 5.5, repeatDelay: 4, delay: 2, className: "h-12" },
  { left: "94%", duration: 6, repeatDelay: 2.5, delay: 0.8 },
  { left: "97.5%", duration: 7, repeatDelay: 3.5, delay: 2.2, className: "h-10" },
];

export function BackgroundBeamsWithCollision() {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={parentRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-bg"
    >
      {BEAMS.map((beam, idx) => (
        <CollisionMechanism
          key={`${beam.left}-${idx}`}
          beamOptions={beam}
          containerRef={containerRef}
          parentRef={parentRef}
        />
      ))}

      <div
        ref={containerRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full bg-transparent"
      />
    </div>
  );
}

function CollisionMechanism({
  parentRef,
  containerRef,
  beamOptions,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  parentRef: React.RefObject<HTMLDivElement | null>;
  beamOptions: BeamOptions;
}) {
  const beamRef = useRef<HTMLDivElement>(null);
  const [collision, setCollision] = useState<{
    detected: boolean;
    coordinates: { x: number; y: number } | null;
  }>({
    detected: false,
    coordinates: null,
  });
  const [beamKey, setBeamKey] = useState(0);
  const [cycleCollisionDetected, setCycleCollisionDetected] = useState(false);

  useEffect(() => {
    const checkCollision = () => {
      if (
        beamRef.current &&
        containerRef.current &&
        parentRef.current &&
        !cycleCollisionDetected
      ) {
        const beamRect = beamRef.current.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const parentRect = parentRef.current.getBoundingClientRect();

        if (beamRect.bottom >= containerRect.top) {
          const relativeX =
            beamRect.left - parentRect.left + beamRect.width / 2;
          const relativeY = beamRect.bottom - parentRect.top;

          setCollision({
            detected: true,
            coordinates: { x: relativeX, y: relativeY },
          });
          setCycleCollisionDetected(true);
        }
      }
    };

    const animationInterval = window.setInterval(checkCollision, 50);
    return () => window.clearInterval(animationInterval);
  }, [cycleCollisionDetected, containerRef, parentRef]);

  useEffect(() => {
    if (collision.detected && collision.coordinates) {
      const t1 = window.setTimeout(() => {
        setCollision({ detected: false, coordinates: null });
        setCycleCollisionDetected(false);
      }, 1800);

      const t2 = window.setTimeout(() => {
        setBeamKey((prev) => prev + 1);
      }, 1800);

      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [collision]);

  return (
    <>
      <motion.div
        key={beamKey}
        ref={beamRef}
        animate="animate"
        initial={{
          translateY: beamOptions.initialY ?? "-200px",
        }}
        variants={{
          animate: {
            translateY: beamOptions.translateY ?? "1400px",
          },
        }}
        transition={{
          duration: beamOptions.duration ?? 8,
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          delay: beamOptions.delay ?? 0,
          repeatDelay: beamOptions.repeatDelay ?? 0,
        }}
        style={{ left: beamOptions.left }}
        className={`absolute top-0 m-auto w-px rounded-full bg-gradient-to-t from-indigo-500 via-purple-500 to-transparent opacity-75 ${
          beamOptions.className ?? "h-14"
        }`}
      />
      <AnimatePresence>
        {collision.detected && collision.coordinates && (
          <Explosion
            key={`${collision.coordinates.x}-${collision.coordinates.y}`}
            style={{
              left: `${collision.coordinates.x}px`,
              top: `${collision.coordinates.y}px`,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function Explosion({ style }: { style?: React.CSSProperties }) {
  const spans = Array.from({ length: 18 }, (_, index) => ({
    id: index,
    directionX: Math.floor(Math.random() * 80 - 40),
    directionY: Math.floor(Math.random() * -50 - 10),
    duration: Math.random() * 1.4 + 0.5,
  }));

  return (
    <div style={style} className="absolute z-50 h-2 w-2">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="absolute -inset-x-10 top-0 m-auto h-2 w-10 rounded-full bg-gradient-to-r from-transparent via-indigo-500 to-transparent blur-sm"
      />
      {spans.map((span) => (
        <motion.span
          key={span.id}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{
            x: span.directionX,
            y: span.directionY,
            opacity: 0,
          }}
          transition={{ duration: span.duration, ease: "easeOut" }}
          className="absolute h-1 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500"
        />
      ))}
    </div>
  );
}

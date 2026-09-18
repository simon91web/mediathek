"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/basis";
import { tourStore } from "@/lib/tour/tour-store";
import { cn } from "@/lib/utils";

/*
 * Der Rundgang — ein einziges Mal in app/layout.tsx gemountet, überlebt jeden
 * Routenwechsel unverändert (wie <LibraryWatcher/>). Der Zustand kommt aus
 * lib/tour/tour-store.ts, keinem eigenen State hier.
 *
 * Fehlt ein Zielelement (data-tour="…"), überspringt der Schritt sich selbst
 * — egal ob es fehlt, weil eine Funktion aus ist (kein Autorenmodus) oder
 * weil eine gerade angestoßene Navigation die Seite noch aufbaut. Genau
 * deshalb wird kurz nachgesehen (bis zu ~4,5 s), statt sofort aufzugeben.
 */

const SCRIM = "rgba(10, 14, 12, 0.6)";

function positionOverlay(
  el: HTMLElement,
  spot: HTMLDivElement,
  card: HTMLDivElement,
) {
  const r = el.getBoundingClientRect();
  const pad = 6;
  const top = r.top - pad;
  const left = r.left - pad;
  const width = r.width + pad * 2;
  const height = r.height + pad * 2;
  spot.style.top = `${top}px`;
  spot.style.left = `${left}px`;
  spot.style.width = `${width}px`;
  spot.style.height = `${height}px`;

  const cardW = Math.min(300, window.innerWidth - 32);
  card.style.width = `${cardW}px`;
  const cardH = card.offsetHeight || 190;
  let cardTop = top + height + 14;
  if (cardTop + cardH > window.innerHeight - 16) {
    cardTop = top - cardH - 14;
    if (cardTop < 16) cardTop = 16;
  }
  let cardLeft = left;
  if (cardLeft + cardW > window.innerWidth - 16) {
    cardLeft = window.innerWidth - 16 - cardW;
  }
  if (cardLeft < 16) cardLeft = 16;
  card.style.top = `${cardTop}px`;
  card.style.left = `${cardLeft}px`;
}

export function TourOverlay({
  platformTourSeen,
  demoSlug,
}: {
  /** Aus den Einstellungen — löst den Einstieg beim allerersten Start aus. */
  platformTourSeen: boolean;
  /** Beitrag für die Workflow-Tour; null bei einer leeren Bibliothek. */
  demoSlug: string | null;
}) {
  const snapshot = useSyncExternalStore(
    tourStore.subscribe,
    tourStore.getSnapshot,
    tourStore.getServerSnapshot,
  );
  const pathname = usePathname();
  const router = useRouter();

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!platformTourSeen) tourStore.start("platform");
  }, [platformTourSeen]);

  const active =
    snapshot.tour && snapshot.tour !== "crosspromo" ? snapshot : null;
  const steps = active ? tourStore.steps(active.tour) : null;
  const step = active && steps ? steps[active.step] : null;

  // Der Einstiegsschirm bleibt dort, wo man ist; erst ein Schritt mit einem
  // Zielelement navigiert von selbst zur passenden Seite.
  useEffect(() => {
    if (!active || !step || step.target === null) return;
    const wanted =
      active.tour === "platform"
        ? "/"
        : demoSlug
          ? `/medien/${demoSlug}`
          : null;
    if (wanted && pathname !== wanted) router.push(wanted);
  }, [active, step, pathname, demoSlug, router]);

  const spotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const foundRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    foundRef.current = null;
    if (!step || step.target === null) return;
    const attr = step.target;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${attr}"]`);
      if (el) {
        foundRef.current = el;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        if (spotRef.current && cardRef.current) {
          positionOverlay(el, spotRef.current, cardRef.current);
        }
        return;
      }
      attempts += 1;
      if (attempts > 30) {
        tourStore.next();
        return;
      }
      timer = setTimeout(tick, 150);
    };
    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active?.tour, active?.step, step]);

  useEffect(() => {
    if (!step || step.target === null) return;
    const handler = () => {
      if (foundRef.current && spotRef.current && cardRef.current) {
        positionOverlay(foundRef.current, spotRef.current, cardRef.current);
      }
    };
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [active?.tour, active?.step, step]);

  useEffect(() => {
    if (!snapshot.tour) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key === "Escape") tourStore.skip();
      else if (event.key === "ArrowRight") tourStore.next();
      else if (event.key === "ArrowLeft") tourStore.back();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [snapshot.tour]);

  if (!snapshot.tour) return null;

  if (snapshot.tour === "crosspromo") {
    return (
      <div className="fixed inset-0 z-100" style={{ background: SCRIM }}>
        <CenterDialog>
          <p className="text-lg font-semibold">Rundgang abgeschlossen</p>
          {demoSlug ? (
            <>
              <p className="mt-2 text-sm text-schrift-2">
                Möchtest du dir auch ansehen, wie du eigene Inhalte
                einpflegst und aufbereitest – Import, Transkription, Kapitel?
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primaer" onClick={tourStore.acceptCrosspromo}>
                  Ja, zeig&apos;s mir
                </Button>
                <Button variant="leise" onClick={tourStore.declineCrosspromo}>
                  Nicht jetzt
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-schrift-2">
                Sobald du deinen ersten Beitrag importiert hast, zeigt dir
                eine zweite Tour, wie du ihn aufbereitest – Import,
                Transkription, Kapitel. Du findest sie jederzeit unter
                Einstellungen → Programm.
              </p>
              <div className="mt-5">
                <Button variant="primaer" onClick={tourStore.end}>
                  Verstanden
                </Button>
              </div>
            </>
          )}
        </CenterDialog>
      </div>
    );
  }

  if (!active || !steps || !step) return null;

  const isLast = active.step === steps.length - 1;

  if (step.target === null) {
    return (
      <div className="fixed inset-0 z-100" style={{ background: SCRIM }}>
        <CenterDialog>
          <p className="mb-1.5 text-xs font-semibold tracking-wide text-akzent uppercase">
            Schritt {active.step + 1} von {steps.length}
          </p>
          <p className="text-lg font-semibold text-balance">{step.title}</p>
          <p className="mt-2 text-sm text-schrift-2">{step.text}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primaer"
              onClick={isLast ? tourStore.end : tourStore.next}
            >
              {step.cta}
            </Button>
            {!isLast && step.secondary ? (
              <Button variant="leise" onClick={tourStore.skip}>
                {step.secondary}
              </Button>
            ) : null}
          </div>
        </CenterDialog>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-100" aria-live="polite">
      <div
        ref={spotRef}
        className="fixed rounded-lg border-2 border-akzent transition-[top,left,width,height] duration-200"
        style={{ boxShadow: `0 0 0 2000px ${SCRIM}` }}
      />
      <div
        ref={cardRef}
        className="fixed rounded-xl border border-rand bg-grund p-4 shadow-2xl transition-[top,left] duration-200"
      >
        <button
          type="button"
          aria-label="Rundgang schließen"
          onClick={tourStore.skip}
          className="absolute top-2.5 right-2.5 rounded-md p-1 text-schrift-3 hover:bg-grund-3 hover:text-schrift"
        >
          <X aria-hidden className="size-4" />
        </button>
        <p className="mb-1 pr-6 text-[11px] font-semibold tracking-wide text-akzent uppercase">
          Schritt {active.step + 1} von {steps.length}
        </p>
        <p className="pr-6 text-sm font-semibold">{step.title}</p>
        <p className="mt-1 text-[13px] text-schrift-2">{step.text}</p>

        <div className="mt-3 flex gap-1.5">
          {steps.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Schritt ${index + 1}`}
              onClick={() => tourStore.goto(index)}
              className={cn(
                "h-1.5 rounded-full bg-rand transition-all",
                index === active.step ? "w-4 bg-akzent" : "w-1.5",
              )}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="leise"
            size="klein"
            disabled={active.step === 0}
            onClick={tourStore.back}
          >
            Zurück
          </Button>
          <div className="flex gap-1.5">
            {!isLast ? (
              <Button variant="leise" size="klein" onClick={tourStore.skip}>
                Überspringen
              </Button>
            ) : null}
            <Button variant="primaer" size="klein" onClick={tourStore.next}>
              {isLast
                ? active.tour === "platform"
                  ? "Weiter"
                  : "Fertig"
                : "Weiter"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenterDialog({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed top-1/2 left-1/2 w-[min(360px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-rand bg-grund p-6 shadow-2xl">
      {children}
    </div>
  );
}

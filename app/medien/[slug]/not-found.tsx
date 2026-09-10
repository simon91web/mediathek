import { ButtonLink, Leer } from "@/components/ui/basis";

export default function BeitragNichtGefunden() {
  return (
    <div className="mx-auto max-w-xl py-10">
      <Leer titel="Diesen Beitrag gibt es nicht">
        Vielleicht wurde der Ordner umbenannt oder verschoben. Unter
        Einstellungen lässt sich die Bibliothek neu einlesen.
      </Leer>
      <div className="mt-4 flex justify-center gap-2">
        <ButtonLink href="/medien" variant="primaer">
          Zur Mediathek
        </ButtonLink>
        <ButtonLink href="/einstellungen">Einstellungen</ButtonLink>
      </div>
    </div>
  );
}

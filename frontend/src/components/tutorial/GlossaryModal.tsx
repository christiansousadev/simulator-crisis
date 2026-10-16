import { BookOpen, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import Modal, { ModalBody, ModalHeader } from "../common/Modal";
import { filterGlossary } from "./glossaryFilter";

const TITLE_ID = "glossary-title";

// SEARCHABLE SRE / DEVOPS / ITIL GLOSSARY: plain definitions with the numbers this simulation uses
export default function GlossaryModal() {
  const t = useTranslation();
  const copy = t.evolution.glossary;
  const open = useGameStore((s) => s.glossaryOpen);
  const close = useGameStore((s) => s.closeGlossary);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const terms = useMemo(() => filterGlossary(copy.terms, query), [copy.terms, query]);

  return (
    <Modal open={open} onClose={close} labelledBy={TITLE_ID} layer="dialog" size="lg" initialFocusRef={inputRef}>
      <ModalHeader
        id={TITLE_ID}
        title={copy.title}
        icon={<BookOpen className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden />}
        onClose={close}
        closeLabel={t.common.close}
      />
      <div className="shrink-0 border-b border-slate-800 px-5 py-3">
        <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 focus-within:border-cyan-500/60">
          <Search className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <span className="sr-only">{copy.searchLabel}</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
        </label>
      </div>
      <ModalBody className="px-5 py-3">
        {terms.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400" role="status">
            {copy.noResults}
          </p>
        ) : (
          <dl className="space-y-3">
            {terms.map((term) => (
              <div key={term.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <dt className="font-heading text-sm font-bold text-cyan-200">{term.name}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-slate-300">{term.body}</dd>
              </div>
            ))}
          </dl>
        )}
      </ModalBody>
    </Modal>
  );
}

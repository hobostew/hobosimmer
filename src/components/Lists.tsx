"use client";
import { useState } from "react";
import { type Item, type ListState, type Store } from "@/lib/client";
import { buyAmount } from "@/lib/shop";
import { Check, STORE_NAMES } from "./Shop";
import { BrandBar, Button, ConfirmSheet, EmptyState, Group, Held, Row, Segmented } from "./ui";

/**
 * Lists: one list per store, and All for everything at once. Every list is a checklist: tick what you got, then Done
 * shopping (confirmed first). No Clear here: New plan on Meals is the one fresh start, and it empties the lists.
 */
export type Where = "all" | Store;
const STORES = Object.keys(STORE_NAMES) as Store[];
const WHERE: { value: Where; label: string }[] = [{ value: "all", label: "All" }, ...STORES.map((s) => ({ value: s as Where, label: STORE_NAMES[s] }))];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type ListsActions = {
  add: (text: string, store?: Store) => Promise<unknown>;
  check: (it: Item, checked: boolean) => void;
  move: (it: Item, store: Store) => void;
  /** Done shopping: the store's ticked items come off the list. */
  done: (store: Store) => Promise<unknown>;
  putBack: (items: Item[]) => void;
};

/** ⋯ as the phone's own menu: what can be done with one row. */
function More({ name, options, onPick }: { name: string; options: { value: string; label: string; off?: boolean }[]; onPick: (v: string) => void }) {
  if (!options.some((o) => !o.off)) return null;
  return (
    <label className="relative flex size-9 shrink-0 items-center justify-center text-[22px] leading-none text-muted">
      <span aria-hidden>⋯</span>
      <select value="" aria-label={`More for ${name}`} onChange={(e) => { if (e.target.value) onPick(e.target.value); }} className="absolute inset-0 size-full cursor-pointer opacity-0 text-base">
        <option value="" disabled>{name}</option>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.off}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** "2 of 5 got" and Done shopping (greyed until something's ticked): the top of a checklist. */
function TopLine({ text, show, onDone }: { text: string; show: boolean; onDone: (() => void) | null }) {
  return (
    <div className="flex min-h-10 items-center gap-1 px-4">
      <span className="min-w-0 flex-1 t-sub font-semibold">{text}</span>
      {show && <button onClick={onDone ?? undefined} disabled={!onDone} className="h-9 rounded-full bg-accent px-4 t-sub font-semibold text-on-accent active:scale-95 disabled:opacity-40 disabled:active:scale-100">Done shopping</button>}
    </div>
  );
}

function TickRow({ it, onTick, more }: { it: Item; onTick: () => void; more: React.ReactNode }) {
  const title = <span className={it.checked ? "text-muted line-through" : ""}>{cap(it.item)}</span>;
  return (
    <div className="flex items-center pr-2">
      <div className="min-w-0 flex-1">
        <Row lead={<Check on={it.checked} />} title={title} subtitle={buyAmount(it.quantity) || undefined} role="checkbox" checked={it.checked} onClick={onTick} />
      </div>
      {more}
    </div>
  );
}

export function ListsScreen({ list, act, start }: { list: ListState | null; act: ListsActions; start: Where }) {
  const [where, setWhere] = useState<Where>(start);
  const [text, setText] = useState("");
  const [finishing, setFinishing] = useState<Item[] | null>(null); // Done shopping, waiting on its confirm
  const items = (list?.items ?? []).filter((i) => !(i.check && !i.checked)); // what Stock highlights isn't on a list yet

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    void act.add(t, where === "all" ? undefined : where);
  };

  const here = where === "all" ? items : items.filter((i) => i.store === where);
  const ticked = here.filter((i) => i.checked);
  // Done shopping asks first, since it can be tapped by mistake.
  const done = () => { if (ticked.length) setFinishing([...ticked]); };
  const doDone = async () => {
    const off = finishing ?? [];
    setFinishing(null);
    for (const s of STORES.filter((s) => off.some((i) => i.store === s))) await act.done(s);
  };
  const more = (it: Item) => (
    <More name={cap(it.item)} options={STORES.map((s) => ({ value: s, label: `Get it at ${STORE_NAMES[s]}`, off: s === it.store }))}
      onPick={(v) => act.move(it, v as Store)} />
  );

  return (
    <div className="space-y-5">
      <BrandBar below={STORES.length > 1 ? <Segmented label="Store" value={where} options={WHERE} onChange={setWhere} /> : undefined} />
      <h1 className="sr-only">Lists</h1>
      <form onSubmit={submit} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add something" aria-label="Add something" enterKeyHint="done"
          className="h-[52px] min-w-0 flex-1 rounded-full bg-card px-5 text-base outline-none ring-accent focus:ring-2" />
        <Button type="submit" disabled={!text.trim()} className="shrink-0 px-5">Add</Button>
      </form>

      {!list ? <Held /> : (
        <>
          <TopLine text={here.length ? `${ticked.length} of ${here.length} got` : ""} show={here.length > 0} onDone={ticked.length ? done : null} />
          {!items.length && <EmptyState icon="list" title="Nothing on the lists" />}
          {(where === "all" ? STORES : [where]).map((s) => {
            const rows = items.filter((i) => i.store === s);
            if (!rows.length) return where === "all" ? null : <EmptyState key={s} icon="list" title={`Nothing for ${STORE_NAMES[s]}`} />;
            return (
              <Group key={s} header={where === "all" && STORES.length > 1 ? STORE_NAMES[s] : undefined}>
                {rows.map((it) => <TickRow key={it.id} it={it} onTick={() => act.check(it, !it.checked)} more={more(it)} />)}
              </Group>
            );
          })}
        </>
      )}

      <ConfirmSheet open={Boolean(finishing)} title={where === "all" ? "Done shopping?" : `Done at ${STORE_NAMES[where]}?`} confirm="Done shopping"
        message={finishing ? `${finishing.length} thing${finishing.length === 1 ? " comes" : "s come"} off the list${where === "all" ? "s" : ""}.` : ""}
        onConfirm={doDone} onCancel={() => setFinishing(null)} />
    </div>
  );
}

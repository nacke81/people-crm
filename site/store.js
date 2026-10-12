// The only file that talks to the database. Rows are snake_case in Postgres, camelCase in the app.
export const toApp = (r) => ({
  id: r.id, name: r.name, relationship: r.relationship || "",
  lastTouched: r.last_touched, cadenceDays: r.cadence_days, followUp: r.follow_up,
  birthday: r.birthday, gifts: r.gifts || [], notes: r.notes || "",
});

export const toRow = (p) => ({
  id: p.id, name: p.name, relationship: p.relationship || null,
  last_touched: p.lastTouched || null, cadence_days: p.cadenceDays ?? null, follow_up: p.followUp || null,
  birthday: p.birthday || null, gifts: p.gifts || [], notes: p.notes || "",
});

export function createStore(sb) {
  return {
    async list() {
      const { data, error } = await sb.from("people").select("*").order("name");
      if (error) throw error;
      return data.map(toApp);
    },
    async put(p) { // insert or update; owner is stamped by the database, never sent
      const { error } = await sb.from("people").upsert(toRow(p));
      if (error) throw error;
    },
    async putMany(list) { // import: upsert by id, so re-importing never duplicates; owner is never sent
      if (!list.length) return;
      const { error } = await sb.from("people").upsert(list.map(toRow));
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await sb.from("people").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

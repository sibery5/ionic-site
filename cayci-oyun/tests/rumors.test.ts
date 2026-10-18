import { describe, expect, it } from 'vitest';
import { EVIDENCE_NEEDED, LEGACY_GOSSIP, PEOPLE, RUMOR, RUMORS, STORY_EVIDENCE, TOPICS, judge, saleKey, vipRumor, type PersonId } from '../src/game/rumors';
import { VENUES } from '../src/game/venues';

describe('dedikodu verisi', () => {
  it('her dedikodunun kaynağı ve konusu geçerli', () => {
    for (const r of RUMORS) {
      expect(PEOPLE[r.source], r.id).toBeDefined();
      expect(TOPICS[r.topic], r.id).toBeDefined();
      for (const a of r.about) expect(PEOPLE[a], r.id).toBeDefined();
      expect(r.text.tr.length).toBeGreaterThan(10);
      expect(r.text.en.length).toBeGreaterThan(10);
    }
    for (const p of Object.values(PEOPLE)) for (const w of p.whispers) expect(RUMOR[w]).toBeDefined();
  });

  it('her ofisin kişisi tanımlı; hikâye kanıtları oyunda gerçekten duyulabilir', () => {
    const present = new Set<PersonId>();
    for (const v of VENUES) for (const o of v.offices) {
      expect(PEOPLE[o.pid], o.pid).toBeDefined();
      present.add(o.pid);
    }
    const reachable = new Set<string>();
    for (const pid of present) {
      const v = vipRumor(pid);
      if (v) reachable.add(v.id);
      for (const w of PEOPLE[pid].whispers) reachable.add(w);
    }
    for (const id of STORY_EVIDENCE) expect(reachable.has(id), id).toBe(true);
    expect(STORY_EVIDENCE.length).toBeGreaterThanOrEqual(EVIDENCE_NEEDED + 2);
  });

  it('her hikâye kanıtını han tarafından biri oyunda satın alabiliyor', () => {
    const buyers = new Set<PersonId>();
    for (const v of VENUES) for (const o of v.offices) if (PEOPLE[o.pid].side === 'han') buyers.add(o.pid);
    for (const id of STORY_EVIDENCE) {
      const r = RUMOR[id];
      const ok = [...buyers].some((b) => judge(r, b, r.topic, []).evidence);
      expect(ok, id).toBe(true);
    }
  });

  it('eski kayıt anahtarları yeni dedikodulara karşılık geliyor', () => {
    for (const id of Object.values(LEGACY_GOSSIP)) expect(RUMOR[id]).toBeDefined();
  });
});

describe('dedikodu satışı', () => {
  it('doğru dedikodu doğru kişiye: ödül ve kanıt', () => {
    const j = judge(RUMOR.ferhat_vekalet, 'nadir', 'tapu', []);
    expect(j.verdict).toBe('reward');
    expect(j.pay).toBe(40);
    expect(j.rep).toBeGreaterThan(0);
    expect(j.evidence).toBe(true);
  });

  it('sorulan konu değilse yine alır ama daha az öder', () => {
    const j = judge(RUMOR.ferhat_vekalet, 'nadir', 'rapor', []);
    expect(j.verdict).toBe('reward');
    expect(j.pay).toBeLessThan(40);
  });

  it('kişinin kendisi hakkındaki laf: öfke (kovalama)', () => {
    expect(judge(RUMOR.f_ask, 'ferhat', 'kulis', []).verdict).toBe('aboutThem');
    expect(judge(RUMOR.lale_foto, 'turgut', 'tapu', []).verdict).toBe('aboutThem');
  });

  it('yalan, konuyu merak edene satılırsa: yalan diye kızar', () => {
    const j = judge(RUMOR.nevin_fal, 'nadir', 'rapor', []);
    expect(j.verdict).toBe('lie');
    expect(j.rep).toBeLessThan(0);
    expect(j.pay).toBe(0);
  });

  it('alakasız konu: bana ne', () => {
    expect(judge(RUMOR.f_takim, 'nadir', 'tapu', []).verdict).toBe('irrelevant');
  });

  it('kaynağına geri anlatmak komik bir hata', () => {
    expect(judge(RUMOR.lale_foto, 'lale', 'foto', []).verdict).toBe('own');
  });

  it('aynı kişiye ikinci kez satılamaz', () => {
    expect(judge(RUMOR.ferhat_vekalet, 'nadir', 'tapu', [saleKey('ferhat_vekalet', 'nadir')]).verdict).toBe('already');
  });

  it('kötü adama satmak: iki kat para, itibar kaybı, kanıt yanar', () => {
    const j = judge(RUMOR.rifat_rapor, 'selim', 'rapor', []);
    expect(j.verdict).toBe('betray');
    expect(j.pay).toBe(80);
    expect(j.rep).toBeLessThan(-10);
    expect(j.burned).toBe(true);
    expect(j.evidence).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════
 *  LoadoutBoard.jsx — 로드아웃 게시판 페이지 + 게시 모달
 *  - 목록: GAS ?action=board (브라우저에서 직접 호출 → Vercel 사용량 0)
 *  - 쓰기: GAS doPost (text/plain JSON → CORS 프리플라이트 없음)
 *  - 아이콘: 목록 카드당 4개(지원무기 + 스트라타젬 3), 펼쳤을 때만 개인 장비 추가
 * ══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  s, RandIcon, FilterSelect, getSupportWeaponInfo, SUPPORT_CLASS_ORDER, sortWeaponTypes,
  decodeLoadoutCode, encodeLoadoutCode, copyText, EMPTY_SLOT_LABEL, getWbBadgeStyle, computeWbSummary,
  getSupportNamesOfSel, getWeaponTypeOfSel, hasAnyItem, BOARD_FACTIONS, normalizeFaction, FactionBadge, FactionPill, cleanSheetText,
  IconLoad, IconSave, IconCopy, IconHeart,
} from "../loadoutShared";

const PAGE_SIZE = 12;
/* 팝업은 body에 직접 렌더 — 페이지 영역(.appWrap)의 쌓임 순서가 상단 메뉴 바보다 낮아 팝업 위쪽이 가려지는 문제 방지 */
const toBody = (node) => (typeof document !== "undefined" ? createPortal(node, document.body) : node);
const LIMITS = { name:30, nickname:16, desc:300, pwMin:4, pwMax:32 };

/* ── 브라우저 저장소 ── */
const LIST_CACHE_KEY = "board_cache_v1";      // 목록 캐시 (60초)
const LIST_CACHE_TTL = 60 * 1000;
const LIKED_KEY      = "board_liked_v1";      // 추천한 게시글 id
const CLIENT_ID_KEY  = "board_client_id";     // 연속 게시 제한용 브라우저 식별값
const LAST_POST_KEY  = "board_last_post_at";  // 마지막 게시 시각 (화면에서 먼저 30초 제한 안내)
const POST_INTERVAL_MS = 30 * 1000;
function lsGetJson(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } }
function lsSetJson(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch { return ""; }
}
export function invalidateBoardCache() { try { localStorage.removeItem(LIST_CACHE_KEY); } catch {} }

/* ── GAS 호출 ── */
async function gasGetBoard(gasUrl) {
  const r = await fetch(`${gasUrl}?action=board`);
  const d = await r.json();
  if (!d?.ok) throw new Error(d?.error || "게시판을 불러오지 못했습니다.");
  return Array.isArray(d.posts) ? d.posts : [];
}
async function gasPost(gasUrl, body) {
  let d;
  try {
    const r = await fetch(gasUrl, {
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    d = await r.json();
  } catch { throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."); }
  if (!d?.ok) throw new Error(d?.error || "요청을 처리하지 못했습니다.");
  return d;
}

function formatDate(iso, withYear = false) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return withYear ? `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())}` : `${p(d.getMonth()+1)}.${p(d.getDate())}`;
}

/* ── 아이콘 칸 (비어 있으면 "자유") ── */
function IconCell({ item, className = "", title }) {
  return (
    <div className={`bdIcon ${item ? "" : "bdIconFree"} ${className}`} title={title ?? (item ? s(item.name_ko) : EMPTY_SLOT_LABEL)}>
      {item ? <RandIcon item={item} className="bdIconImg" /> : <span>{EMPTY_SLOT_LABEL}</span>}
    </div>
  );
}

/* 지원무기 대표 칸 + 나머지 스트라타젬 분리 */
function splitStratagems(sel) {
  const strats = (Array.isArray(sel?.stratagem) ? sel.stratagem : [null,null,null,null]).slice(0, 4);
  while (strats.length < 4) strats.push(null);
  const sw = getSupportWeaponInfo(sel);
  if (sw.mode === "main") {
    const idx = strats.findIndex(it => it && s(it.id) === s(sw.itemId));
    const main = strats[idx] ?? null;
    const others = strats.filter((_, i) => i !== idx).slice(0, 3);
    return { sw, main, others };
  }
  return { sw, main:null, others:strats };   // 지원무기 대표가 없으면 4칸 모두 표시
}
function SupportHero({ sw, main, size = "md" }) {
  return (
    <div className={`bdHero bdHero_${size}`}>
      <div className={`bdHeroBox ${sw.mode === "main" ? "" : "bdHeroBoxText"}`}>
        {sw.mode === "main" && <RandIcon item={main ?? { icon:sw.icon, sheet:sw.sheet, id:sw.itemId, name_ko:sw.name }} className="bdIconImg" />}
        {sw.mode === "none" && <span>지원무기<br/>없음</span>}
        {sw.mode === "disposableOnly" && <span className="bdHeroDisp">일회성<br/>로드아웃</span>}
      </div>
      {size === "md" && sw.mode === "disposableOnly" && (
        <div className="bdHeroName bdHeroNameDisp"><span className="bdHeroNameText">일회성</span></div>
      )}
      {size === "md" && sw.mode === "none" && (
        <div className="bdHeroName bdHeroNameNone"><span className="bdHeroNameText">지원무기 없음</span></div>
      )}
      {size === "md" && sw.mode === "main" && (
        <div className="bdHeroName" title={sw.extraCount > 0 ? `${sw.name} +${sw.extraCount}` : sw.name}>
          <span className="bdHeroNameText">{sw.name}</span>
          {sw.extraCount > 0 && <span className="bdHeroExtra">+{sw.extraCount}</span>}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  게시 모달 — source "current"(빌더 현재 구성) | "saved"(저장된 로드아웃 선택)
 * ══════════════════════════════════════════════════════════════ */
export function BoardPostModal({ open, source = "current", selected, defaultName = "", savedLoadouts = [], gasUrl, onClose, onPosted }) {
  const userSaved = useMemo(() => savedLoadouts.filter(l => !l.isDefault), [savedLoadouts]);
  const [pickId,   setPickId]   = useState("");
  const [name,     setName]     = useState("");
  const [faction,  setFaction]  = useState("");
  const [nickname, setNickname] = useState("");
  const [desc,     setDesc]     = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [sending,  setSending]  = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(""); setSending(false); setDesc(""); setPassword("");
    setNickname(lsGetJson("board_last_nickname") ?? "");
    if (source === "saved") {
      const first = userSaved[0];
      setPickId(first ? String(first.id) : "");
      setName(first ? s(first.name).slice(0, LIMITS.name) : "");
    } else {
      setName(s(defaultName).slice(0, LIMITS.name));
    }
    setFaction("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const picked = source === "saved" ? userSaved.find(l => String(l.id) === pickId) : null;
  const sel = source === "saved" ? picked?.selected : selected;

  async function submit() {
    setError("");
    if (!sel || !hasAnyItem(sel)) { setError(source === "saved" ? "게시할 로드아웃을 선택해 주세요." : "선택된 장비가 없습니다."); return; }
    if (!faction) { setError("상대할 팩션을 선택해 주세요."); return; }
    if (password.length < LIMITS.pwMin || password.length > LIMITS.pwMax) {
      setError(`삭제 비밀번호는 ${LIMITS.pwMin}~${LIMITS.pwMax}자로 입력해 주세요.`); return;
    }
    const lastAt = Number(lsGetJson(LAST_POST_KEY) || 0);
    const remain = Math.ceil((POST_INTERVAL_MS - (Date.now() - lastAt)) / 1000);
    if (remain > 0) { setError(`잠시 후 다시 게시해 주세요. (${remain}초 남음)`); return; }
    setSending(true);
    try {
      const code = encodeLoadoutCode(sel, name);
      const d = await gasPost(gasUrl, {
        action:"post", code, name:name.trim(), faction, nickname:nickname.trim(),
        desc:desc.trim(), password, clientId:getClientId(),
      });
      lsSetJson("board_last_nickname", nickname.trim());
      lsSetJson(LAST_POST_KEY, Date.now());
      invalidateBoardCache();
      onPosted?.(d.post);
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  }

  return toBody(
    <div className="wbOwnedOverlay" onClick={e => { e.stopPropagation(); if (!sending) onClose?.(); }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!sending) onClose?.(); }}>
      <div className="wbOwnedCard bdPostCard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="wbOwnedHeader">
          <div className="wbOwnedTitle">{source === "saved" ? "저장된 로드아웃 게시하기" : "현재 구성 게시하기"}</div>
          <div className="wbOwnedDesc">게시한 로드아웃은 다른 헬다이버가 보고 불러올 수 있습니다.</div>
        </div>
        <div className="bdPostBody">
          {source === "saved" && (
            <label className="bdField">
              <span className="bdFieldLabel">로드아웃 선택</span>
              {userSaved.length === 0
                ? <span className="bdFieldHint">저장된 로드아웃이 없습니다. 빌더에서 먼저 저장해 주세요.</span>
                : (
                  <select className="saveModalInput bdSelect" value={pickId}
                    onChange={e => { const l = userSaved.find(x => String(x.id) === e.target.value); setPickId(e.target.value); if (l) setName(s(l.name).slice(0, LIMITS.name)); }}>
                    {userSaved.map(l => <option key={l.id} value={String(l.id)}>{l.name}</option>)}
                  </select>
                )}
            </label>
          )}
          {sel && hasAnyItem(sel) && (() => {
            const { sw, main, others } = splitStratagems(sel);
            return (
              <div className="bdPostPreview">
                <SupportHero sw={sw} main={main} size="sm" />
                {others.map((it, i) => <IconCell key={i} item={it} className="bdIcon_sm" />)}
                <span className="bdPostPreviewPrimary">{s(sel.primary?.name_ko) || EMPTY_SLOT_LABEL}</span>
              </div>
            );
          })()}
          <label className="bdField">
            <span className="bdFieldLabel">로드아웃 명칭 <em>{name.length}/{LIMITS.name}</em></span>
            <input className="saveModalInput" value={name} maxLength={LIMITS.name}
              onChange={e => setName(e.target.value)} placeholder={`최대 ${LIMITS.name}자까지 입력 가능`} />
          </label>
          <div className="bdField">
            <span className="bdFieldLabel">상대 팩션</span>
            <div className="bdFactionPick">
              {BOARD_FACTIONS.map(f => <FactionPill key={f} faction={f} active={faction === f} onClick={() => setFaction(f)} size="sm" />)}
            </div>
          </div>
          <label className="bdField">
            <span className="bdFieldLabel">작성자 <em>{nickname.length}/{LIMITS.nickname}</em></span>
            <input className="saveModalInput" value={nickname} maxLength={LIMITS.nickname}
              onChange={e => setNickname(e.target.value)} placeholder="비워두면 헬다이버 #0000 형식으로 표시" />
          </label>
          <label className="bdField">
            <span className="bdFieldLabel">설명란 <em>{desc.length}/{LIMITS.desc}</em></span>
            <textarea className="saveModalInput bdTextarea" value={desc} maxLength={LIMITS.desc} rows={4}
              onChange={e => setDesc(e.target.value)} placeholder={`최대 ${LIMITS.desc}자까지 입력 가능.`} />
          </label>
          <label className="bdField">
            <span className="bdFieldLabel">삭제 비밀번호 ({LIMITS.pwMin}~{LIMITS.pwMax}자)</span>
            <span className="bdFieldHint">다른 사이트에서 쓰는 비밀번호는 사용하지 마세요.</span>
            <input className="saveModalInput bdSecret" type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              data-lpignore="true" data-1p-ignore="true" data-form-type="other" value={password} maxLength={LIMITS.pwMax}
              onChange={e => setPassword(e.target.value)} placeholder="게시글을 삭제할 때 필요합니다" />
          </label>
          {error && <div className="bdError">{error}</div>}
        </div>
        <div className="wbOwnedActions">
          <button className="wbOwnedCancel" type="button" onClick={onClose} disabled={sending}>취소</button>
          <button className="wbOwnedConfirm" type="button" onClick={submit} disabled={sending}>{sending ? "게시 중…" : "게시하기"}</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
 *  게시판 페이지
 * ══════════════════════════════════════════════════════════════ */
export default function LoadoutBoard({ items, savedLoadouts, gasUrl, isMobileUI, onLoadToBuilder, onSaveToMine, showToast }) {
  const [posts,    setPosts]    = useState(() => lsGetJson(LIST_CACHE_KEY)?.posts ?? []);
  const [loading,  setLoading]  = useState(false);
  const [loadErr,  setLoadErr]  = useState("");
  const [liked,    setLiked]    = useState(() => new Set(lsGetJson(LIKED_KEY) ?? []));
  const [expanded, setExpanded] = useState(null);
  const [page,     setPage]     = useState(1);
  const [faction,  setFaction]  = useState("");          // "" = 전체
  const [sortBy,   setSortBy]   = useState("최신순");
  const [fClass,   setFClass]   = useState("");
  const [fSupport, setFSupport] = useState("");
  const [fWT,      setFWT]      = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [delTarget,setDelTarget]= useState(null);         // { id, name }
  const [delPw,    setDelPw]    = useState("");
  const [delErr,   setDelErr]   = useState("");
  const [busyId,   setBusyId]   = useState(null);
  const [condOpen, setCondOpen] = useState(false);          // 모바일 조건 팝업
  /* 내 게시글 찾기 (작성자 + 비밀번호 → 서버에서 해시 대조). 비밀번호는 저장하지 않고 화면을 떠나면 사라짐 */
  const [mine,     setMine]     = useState(null);           // { ids:Set, nickname, password }
  const [mineOpen, setMineOpen] = useState(false);
  const [mineNick, setMineNick] = useState(() => lsGetJson("board_last_nickname") ?? "");
  const [minePw,   setMinePw]   = useState("");
  const [mineErr,  setMineErr]  = useState("");
  const [mineBusy, setMineBusy] = useState(false);
  const topRef = useRef(null);

  async function load(force = false) {
    const cached = lsGetJson(LIST_CACHE_KEY);
    if (!force && cached && Date.now() - Number(cached.savedAt || 0) < LIST_CACHE_TTL) {
      setPosts(cached.posts ?? []); return;
    }
    setLoading(true); setLoadErr("");
    try {
      const list = await gasGetBoard(gasUrl);
      setPosts(list);
      lsSetJson(LIST_CACHE_KEY, { savedAt:Date.now(), posts:list });
    } catch (e) {
      setLoadErr(e.message || "게시판을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updatePosts(fn) {
    setPosts(prev => {
      const next = fn(prev);
      lsSetJson(LIST_CACHE_KEY, { savedAt:Date.now(), posts:next });
      return next;
    });
  }

  /* 코드 해독 (DB에서 빠진 장비는 비움, 해독 불가 글은 제외) */
  const decoded = useMemo(() => {
    const out = [];
    for (const p of posts) {
      try {
        const { selected } = decodeLoadoutCode(p.code, items);
        out.push({
          ...p, selected, faction: normalizeFaction(p.faction),
          name: cleanSheetText(p.name), nickname: cleanSheetText(p.nickname), desc: cleanSheetText(p.desc),
        });
      } catch { /* 손상/구버전 코드는 목록에서 제외 */ }
    }
    return out;
  }, [posts, items]);

  /* ── 필터 (팩션 탭 + 지원무기 대/소분류 + 주무장, 서로 선택지 좁힘) ── */
  const byFaction = useMemo(() => {
    let list = mine ? decoded.filter(p => mine.ids.has(p.id)) : decoded;
    return faction ? list.filter(p => p.faction === faction) : list;
  }, [decoded, faction, mine]);
  const mClass   = (p) => !fClass   || getSupportNamesOfSel(p.selected, fClass).length > 0;
  const mSupport = (p) => !fSupport || getSupportNamesOfSel(p.selected).includes(fSupport);
  const mWT      = (p) => !fWT      || getWeaponTypeOfSel(p.selected) === fWT;
  const classOptions = useMemo(() => {
    const base = byFaction.filter(mWT);
    return SUPPORT_CLASS_ORDER.filter(c => base.some(p => getSupportNamesOfSel(p.selected, c).length > 0));
  }, [byFaction, fWT]); // eslint-disable-line react-hooks/exhaustive-deps
  const supportOptions = useMemo(() => {
    const set = new Set();
    byFaction.filter(p => mWT(p) && mClass(p)).forEach(p => getSupportNamesOfSel(p.selected, fClass).forEach(n => set.add(n)));
    return [...set].sort((a, b) => a.localeCompare(b, "ko"));
  }, [byFaction, fWT, fClass]); // eslint-disable-line react-hooks/exhaustive-deps
  const wtOptions = useMemo(() => {
    const set = new Set();
    byFaction.filter(p => mClass(p) && mSupport(p)).forEach(p => { const w = getWeaponTypeOfSel(p.selected); if (w) set.add(w); });
    return sortWeaponTypes([...set]);
  }, [byFaction, fClass, fSupport]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fClass && !classOptions.includes(fClass)) setFClass(""); }, [classOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fSupport && !supportOptions.includes(fSupport)) setFSupport(""); }, [supportOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (fWT && !wtOptions.includes(fWT)) setFWT(""); }, [wtOptions]); // eslint-disable-line react-hooks/exhaustive-deps
  const filterActive = !!(fClass || fSupport || fWT);
  const condCount = [faction, fClass, fSupport, fWT].filter(Boolean).length;
  function resetFilters() { setFClass(""); setFSupport(""); setFWT(""); }

  const filtered = useMemo(() => {
    const list = byFaction.filter(p => mClass(p) && mSupport(p) && mWT(p));
    if (sortBy === "추천순") list.sort((a, b) => (b.likes - a.likes) || (a.createdAt < b.createdAt ? 1 : -1));
    else list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return list;
  }, [byFaction, fClass, fSupport, fWT, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [faction, fClass, fSupport, fWT, sortBy]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const openPost = expanded ? decoded.find(p => p.id === expanded) ?? null : null;
  function goPage(n) { setPage(n); topRef.current?.scrollIntoView({ behavior:"smooth", block:"start" }); }

  /* ── 동작 ── */
  async function toggleLike(p) {
    if (busyId) return;
    const isLiked = liked.has(p.id);
    setBusyId(p.id);
    try {
      const d = await gasPost(gasUrl, { action:"like", id:p.id, delta: isLiked ? -1 : 1 });
      const next = new Set(liked);
      isLiked ? next.delete(p.id) : next.add(p.id);
      setLiked(next); lsSetJson(LIKED_KEY, [...next]);
      updatePosts(prev => prev.map(x => x.id === p.id ? { ...x, likes:d.likes } : x));
    } catch (e) { showToast?.(e.message, "err"); }
    finally { setBusyId(null); }
  }
  async function copyCode(p) {
    const ok = await copyText(p.code);
    if (ok) showToast?.("로드아웃 코드를 복사했습니다.", "ok");
    else window.prompt("아래 코드를 복사해 주세요.", p.code);
  }
  async function confirmDelete() {
    if (!delTarget) return;
    if (!delPw) { setDelErr("비밀번호를 입력해 주세요."); return; }
    setBusyId(delTarget.id); setDelErr("");
    try {
      await gasPost(gasUrl, { action:"delete", id:delTarget.id, password:delPw });
      updatePosts(prev => prev.filter(x => x.id !== delTarget.id));
      if (mine?.ids.has(delTarget.id)) {
        const ids = new Set(mine.ids); ids.delete(delTarget.id);
        setMine(ids.size ? { ...mine, ids } : null);
      }
      showToast?.(`"${delTarget.name}" 게시글을 삭제했습니다.`, "ok");
      setDelTarget(null); setDelPw(""); setExpanded(null);
    } catch (e) { setDelErr(e.message); }
    finally { setBusyId(null); }
  }
  async function findMine() {
    if (!mineNick.trim() || !minePw) { setMineErr("작성자와 비밀번호를 모두 입력해 주세요."); return; }
    setMineBusy(true); setMineErr("");
    try {
      const d = await gasPost(gasUrl, { action:"mine", nickname:mineNick.trim(), password:minePw });
      const ids = Array.isArray(d.ids) ? d.ids : [];
      if (ids.length === 0) { setMineErr("일치하는 게시글이 없습니다. 작성자와 비밀번호를 확인해 주세요."); return; }
      setMine({ ids:new Set(ids), nickname:mineNick.trim(), password:minePw });
      setFaction(""); resetFilters(); setSortBy("최신순"); setPage(1);
      setMineOpen(false); setCondOpen(false); setMinePw("");
      await load(true);   // 방금 올린 글이 캐시에 없을 수 있으므로 최신 목록으로
      showToast?.(`내 게시글 ${ids.length}개를 찾았습니다.`, "ok");
    } catch (e) { setMineErr(e.message); }
    finally { setMineBusy(false); }
  }
  function exitMine() { setMine(null); setPage(1); }

  function handlePosted(post) {
    setPostOpen(false);
    updatePosts(prev => [post, ...prev.filter(x => x.id !== post.id)]);
    setFaction(""); resetFilters(); setSortBy("최신순"); setPage(1); setExpanded(post.id);
    showToast?.("정상적으로 게시됐습니다.", "ok");
  }

  const refreshBtn = (
    <button type="button" className="bdRefreshBtn" onClick={() => load(true)} disabled={loading} aria-label="새로고침" title="새로고침">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={loading ? "bdSpin" : ""}>
        <path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>
      </svg>
    </button>
  );
  const postBtn = <button type="button" className="bdPostBtn" onClick={() => setPostOpen(true)}>저장된 로드아웃 게시하기</button>;
  const mineBtn = mine
    ? <button type="button" className="bdMineBtn on" onClick={exitMine}>내 게시글 보기 해제</button>
    : <button type="button" className="bdMineBtn" onClick={() => { setMineErr(""); setMineOpen(true); }}>내 게시글 찾기</button>;

  return (
    <div className={`pageBoard ${isMobileUI ? "pageBoardMobile" : ""}`} ref={topRef}>
      {isMobileUI ? (
        /* 모바일: 상단 고정 영역 (제목 + 조건 + 정렬) */
        <div className="bdStickyTop">
          <div className="bdStickyRow">
            <div className="bdTitle">로드아웃 게시판</div>
            <div className="bdStickyControls">
              <button type="button" className="bdCondBtn" onClick={() => setCondOpen(true)}>
                로드아웃 조건 추가{condCount > 0 && <span className="manageFilterCount">{condCount}</span>}
              </button>
              <FilterSelect label="정렬" value={sortBy === "최신순" ? "" : sortBy} options={["추천순"]} onChange={v => setSortBy(v || "최신순")} allLabel="최신순" />
            </div>
          </div>
          <span className="bdCount bdStickyCount">{filtered.length}개</span>
        </div>
      ) : (
        <>
          <div className="bdHeader">
            <div className="bdTitle">로드아웃 게시판</div>
            <div className="bdHeaderActions">{mineBtn}{refreshBtn}{postBtn}</div>
          </div>
          <div className="bdFactionTabs" role="tablist">
            <FactionPill faction="" active={!faction} onClick={() => setFaction("")} />
            {BOARD_FACTIONS.map(f => <FactionPill key={f} faction={f} active={faction === f} onClick={() => setFaction(f)} />)}
          </div>
          <div className="bdFilterRow">
            <FilterSelect label="지원무기 대분류" value={fClass}   options={classOptions}   onChange={setFClass}   allLabel="대분류 전체" />
            <FilterSelect label={fClass || "지원무기 소분류"} value={fSupport} options={supportOptions} onChange={setFSupport} allLabel="소분류" />
            <FilterSelect label="주무장 소분류"   value={fWT}      options={wtOptions}      onChange={setFWT}      allLabel="주무장 전체" />
            <FilterSelect label="정렬" value={sortBy === "최신순" ? "" : sortBy} options={["추천순"]} onChange={v => setSortBy(v || "최신순")} allLabel="최신순" />
            {filterActive && <button type="button" className="manageFilterReset" onClick={resetFilters}>필터 해제</button>}
            <span className="bdCount">{filtered.length}개</span>
          </div>
        </>
      )}

      {mine && (
        <div className="bdMineBanner">
          <span><b>{mine.nickname}</b> 님의 게시글 {mine.ids.size}개를 보고 있습니다.</span>
          <button type="button" className="bdLinkBtn" onClick={exitMine}>전체 보기</button>
        </div>
      )}
      {loadErr && <div className="bdError" style={{ margin:"8px 0" }}>{loadErr} <button type="button" className="bdLinkBtn" onClick={() => load(true)}>다시 시도</button></div>}
      {!loadErr && !loading && filtered.length === 0 && (
        <div className="bdEmpty">
          {decoded.length === 0 ? "아직 게시된 로드아웃이 없습니다. 첫 로드아웃을 공유해 보세요." : "조건에 맞는 로드아웃이 없습니다."}
        </div>
      )}
      {loading && posts.length === 0 && <div className="bdEmpty">게시판을 불러오는 중…</div>}

      <div className="bdGrid">
        {pageItems.map(p => {
          const { sw, main, others } = splitStratagems(p.selected);
          const sel = p.selected;
          return (
            <button key={p.id} type="button" className="bdCard" onClick={() => setExpanded(p.id)}>
              <SupportHero sw={sw} main={main} size={isMobileUI ? "sm" : "md"} />
              <div className="bdCardInfo">
                <div className="bdCardTop">
                  <span className="bdCardName">{p.name}</span>
                  <span className={`bdLikes ${liked.has(p.id) ? "on" : ""}`}>♥ {p.likes}</span>
                </div>
                <div className="bdCardIcons">
                  {others.map((it, i) => <IconCell key={i} item={it} className="bdIcon_sm" />)}
                  <FactionBadge faction={p.faction} size="sm" />
                </div>
                <div className="bdCardMeta">
                  <span className="bdPrimary">{s(sel.primary?.name_ko) || EMPTY_SLOT_LABEL}</span>
                  <span className="bdMetaText">{p.nickname} · {formatDate(p.createdAt)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div className="bdPager">
          <button type="button" className="bdPageBtn" disabled={page <= 1} onClick={() => goPage(page - 1)} aria-label="이전 페이지">‹</button>
          {Array.from({ length:pageCount }, (_, i) => i + 1)
            .filter(n => n === 1 || n === pageCount || Math.abs(n - page) <= 2)
            .map((n, i, arr) => (
              <span key={n} style={{ display:"contents" }}>
                {i > 0 && n - arr[i-1] > 1 && <span className="bdPageGap">…</span>}
                <button type="button" className={`bdPageBtn ${n === page ? "on" : ""}`} onClick={() => goPage(n)}>{n}</button>
              </span>
            ))}
          <button type="button" className="bdPageBtn" disabled={page >= pageCount} onClick={() => goPage(page + 1)} aria-label="다음 페이지">›</button>
        </div>
      )}

      {/* 모바일: 하단 고정 바 (새로고침 / 게시하기) */}
      {isMobileUI && <div className="bdBottomBar">{refreshBtn}{postBtn}</div>}

      {/* 게시글 상세 팝업 */}
      {openPost && (() => {
        const p = openPost, sel = p.selected;
        const { sw, main } = splitStratagems(sel);
        const wbSummary = computeWbSummary(sel);
        const strats = (sel.stratagem ?? []).slice(0, 4);
        return toBody(
          <div className="wbOwnedOverlay" onClick={e => { e.stopPropagation(); setExpanded(null); }}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!delTarget) setExpanded(null); }}>
            <div className="wbOwnedCard bdDetailCard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="bdDetailHead">
                <FactionBadge faction={p.faction} />
                <span className="bdCardName">{p.name}</span>
                <span className="bdMetaText">{p.nickname} · {formatDate(p.createdAt, true)}</span>
                <button type="button" className="modalClose bdDetailClose" onClick={() => setExpanded(null)}>닫기</button>
              </div>
              <div className="bdDetailBody">
                <div className="bdOpenBody">
                  <span className="bdOpenLabel bdStratLabelTop">스트라타젬</span>{/* 모바일 전용: 지원무기 대표 칸 위 */}
                  <SupportHero sw={sw} main={main} size="lg" />
                  <div className="bdOpenGroup bdOpenGroupStrat">
                    <span className="bdOpenLabel bdStratLabelInner">스트라타젬</span>
                    <div className="bdStratGrid">
                      {[0,1,2,3].map(i => <IconCell key={i} item={strats[i] ?? null} className={strats[i] && main && s(strats[i].id) === s(main.id) ? "bdIconSw" : ""} />)}
                    </div>
                  </div>
                  <div className="bdOpenDivider" />
                  <div className="bdOpenGroup bdOpenGroupGear">
                    <span className="bdOpenLabel">개인 장비</span>
                    <div className="bdGearGrid">
                      <IconCell item={sel.armor} className="bdGearArmor" />
                      <IconCell item={sel.primary} className="bdGearPrimary" />
                      <IconCell item={sel.secondary} className="bdGearSide" />
                      <IconCell item={sel.throwable} className="bdGearSide" />
                    </div>
                  </div>
                </div>
                <div className="bdNameList">
                  {[["방어구", sel.armor], ["주무기", sel.primary], ["보조무기", sel.secondary], ["투척무기", sel.throwable]].map(([lbl, it]) => (
                    <span key={lbl}><em>{lbl}</em>{s(it?.name_ko) || EMPTY_SLOT_LABEL}</span>
                  ))}
                </div>
                {p.desc && <p className="bdDesc">{p.desc}</p>}
                <div className="bdWbRow">
                  {wbSummary.length > 0 ? wbSummary.map(({ wb, page:pg }) => {
                    const st = getWbBadgeStyle(wb);
                    return <span key={wb} className="statWbBadge bdWbBadge" style={{ color:st.color, background:st.background, borderColor:st.borderColor, textShadow:st.textShadow ?? "none" }}>{pg > 0 ? `${wb} ${pg}페이지` : wb}</span>;
                  }) : <span className="statEmpty">채권 불필요</span>}
                </div>
              </div>
              {isMobileUI ? (
                /* 모바일: 아이콘 버튼 (불러오기 / 저장 / 코드 복사 / 추천) + 삭제 */
                <div className="bdActions bdDetailActions bdIconActions">
                  <button type="button" className="manageIconBtn manageIconBtnLoad" aria-label="빌더로 불러오기" title="빌더로 불러오기"
                    onClick={() => { setExpanded(null); onLoadToBuilder?.(sel, p.name); }}><IconLoad /></button>
                  <button type="button" className="manageIconBtn bdIconSave" aria-label="내 로드아웃으로 저장" title="내 로드아웃으로 저장"
                    onClick={() => onSaveToMine?.(sel, p.name)}><IconSave /></button>
                  <button type="button" className="manageIconBtn manageIconBtnCode" aria-label="코드 복사" title="코드 복사"
                    onClick={() => copyCode(p)}><IconCopy /></button>
                  <button type="button" className={`manageIconBtn manageIconBtnLike ${liked.has(p.id) ? "on" : ""}`}
                    aria-label={liked.has(p.id) ? "추천 취소" : "추천"} title={liked.has(p.id) ? "추천 취소" : "추천"}
                    onClick={() => toggleLike(p)} disabled={busyId === p.id}>
                    <IconHeart filled={liked.has(p.id)} /><span>{p.likes}</span>
                  </button>
                  <button type="button" className="bdAct bdActDel" onClick={() => { setDelTarget({ id:p.id, name:p.name }); setDelPw(mine?.ids.has(p.id) ? mine.password : ""); setDelErr(""); }}>삭제</button>
                </div>
              ) : (
              <div className="bdActions bdDetailActions">
                <button type="button" className="bdAct bdActLoad" onClick={() => { setExpanded(null); onLoadToBuilder?.(sel, p.name); }}>빌더로 불러오기</button>
                <button type="button" className="bdAct bdActSave" onClick={() => onSaveToMine?.(sel, p.name)}>내 로드아웃으로 저장</button>
                <button type="button" className="bdAct bdActCode" onClick={() => copyCode(p)}>코드 복사</button>
                <button type="button" className={`bdAct bdActLike ${liked.has(p.id) ? "on" : ""}`} onClick={() => toggleLike(p)} disabled={busyId === p.id}>
                  {liked.has(p.id) ? "추천 취소" : "추천"}
                </button>
                <span className={`bdLikes ${liked.has(p.id) ? "on" : ""}`}>♥ {p.likes}</span>
                <button type="button" className="bdAct bdActDel" onClick={() => { setDelTarget({ id:p.id, name:p.name }); setDelPw(mine?.ids.has(p.id) ? mine.password : ""); setDelErr(""); }}>삭제</button>
              </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 모바일: 로드아웃 조건 팝업 (선택 즉시 반영) */}
      {condOpen && toBody(
        <div className="wbOwnedOverlay" onClick={e => { e.stopPropagation(); setCondOpen(false); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCondOpen(false); }}>
          <div className="wbOwnedCard manageFilterPopupCard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="wbOwnedHeader">
              <div className="wbOwnedTitle">로드아웃 조건</div>
              <div className="wbOwnedDesc">조건에 맞는 로드아웃 {filtered.length}개</div>
            </div>
            <div className="manageFilterPopupBody">
              <div className="manageFilterPopupField">
                <div className="filterTitle">내 게시글</div>
                {mineBtn}
              </div>
              <div className="manageFilterPopupField">
                <div className="filterTitle">상대 팩션</div>
                <div className="bdCondFactions">
                  <FactionPill faction="" active={!faction} onClick={() => setFaction("")} size="sm" />
                  {BOARD_FACTIONS.map(f => <FactionPill key={f} faction={f} active={faction === f} onClick={() => setFaction(f)} size="sm" />)}
                </div>
              </div>
              <div className="manageFilterPopupField">
                <div className="filterTitle">지원무기 대분류</div>
                <FilterSelect label="지원무기 대분류" value={fClass} options={classOptions} onChange={setFClass} allLabel="대분류 전체" />
              </div>
              <div className="manageFilterPopupField">
                <div className="filterTitle">지원무기 소분류</div>
                <FilterSelect label={fClass || "지원무기 소분류"} value={fSupport} options={supportOptions} onChange={setFSupport} allLabel="소분류" />
              </div>
              <div className="manageFilterPopupField">
                <div className="filterTitle">주무장 소분류</div>
                <FilterSelect label="주무장 소분류" value={fWT} options={wtOptions} onChange={setFWT} allLabel="주무장 전체" />
              </div>
            </div>
            <div className="wbOwnedActions">
              <button className="wbOwnedCancel" type="button" onClick={() => { setFaction(""); resetFilters(); }} disabled={condCount === 0}>조건 해제</button>
              <button className="wbOwnedConfirm" type="button" onClick={() => setCondOpen(false)}>적용</button>
            </div>
          </div>
        </div>
      )}

      {/* 게시 모달 (저장된 로드아웃) */}
      <BoardPostModal open={postOpen} source="saved" savedLoadouts={savedLoadouts} gasUrl={gasUrl}
        onClose={() => setPostOpen(false)} onPosted={handlePosted} />

      {/* 내 게시글 찾기 */}
      {mineOpen && toBody(
        <div className="wbOwnedOverlay" onClick={e => { e.stopPropagation(); if (!mineBusy) setMineOpen(false); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!mineBusy) setMineOpen(false); }}>
          <div className="wbOwnedCard bdDelCard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="wbOwnedHeader">
              <div className="wbOwnedTitle">내 게시글 찾기</div>
              <div className="wbOwnedDesc">게시할 때 입력했던 작성자명과 삭제 비밀번호를 입력해주세요. 작성자명을 비우고 게시한 경우 자동으로 생성된 작성자명(헬다이버 #0000)을 입력해야 합니다. 비밀번호 대입 방지를 위해 1분에 10번까지만 요청할 수 있습니다.</div>
            </div>
            <div className="bdPostBody">
              <label className="bdField">
                <span className="bdFieldLabel">작성자</span>
                <input className="saveModalInput" value={mineNick} maxLength={LIMITS.nickname}
                  onChange={e => { setMineNick(e.target.value); setMineErr(""); }} placeholder="게시할 때 입력한 작성자" />
              </label>
              <label className="bdField">
                <span className="bdFieldLabel">삭제 비밀번호</span>
                <input className="saveModalInput bdSecret" type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  data-lpignore="true" data-1p-ignore="true" data-form-type="other" value={minePw}
                  onChange={e => { setMinePw(e.target.value); setMineErr(""); }}
                  onKeyDown={e => { if (e.key === "Enter") findMine(); }} placeholder="게시할 때 정한 비밀번호" />
              </label>
              {mineErr && <div className="bdError">{mineErr}</div>}
            </div>
            <div className="wbOwnedActions">
              <button className="wbOwnedCancel" type="button" onClick={() => setMineOpen(false)} disabled={mineBusy}>취소</button>
              <button className="wbOwnedConfirm" type="button" onClick={findMine} disabled={mineBusy}>{mineBusy ? "찾는 중…" : "찾기"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 비밀번호 확인 */}
      {delTarget && toBody(
        <div className="wbOwnedOverlay" onClick={e => { e.stopPropagation(); if (!busyId) setDelTarget(null); }}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); if (!busyId) setDelTarget(null); }}>
          <div className="wbOwnedCard bdDelCard" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="wbOwnedHeader">
              <div className="wbOwnedTitle" style={{ color:"#fca5a5" }}>게시글 삭제</div>
              <div className="wbOwnedDesc">"{delTarget.name}" 게시글을 삭제합니다. 삭제하면 되돌릴 수 없습니다.</div>
            </div>
            <div className="bdPostBody">
              <input className="saveModalInput bdSecret" type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              data-lpignore="true" data-1p-ignore="true" data-form-type="other" value={delPw} autoFocus
                onChange={e => { setDelPw(e.target.value); setDelErr(""); }}
                onKeyDown={e => { if (e.key === "Enter") confirmDelete(); }}
                placeholder="게시할 때 정한 삭제 비밀번호" />
              {delErr && <div className="bdError">{delErr}</div>}
            </div>
            <div className="wbOwnedActions">
              <button className="wbOwnedCancel" type="button" onClick={() => setDelTarget(null)} disabled={!!busyId}>취소</button>
              <button className="wbOwnedConfirm bdDelConfirm" type="button" onClick={confirmDelete} disabled={!!busyId}>{busyId ? "삭제 중…" : "삭제"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

// ============================================================
// CONSTANTS
// ============================================================
const TIERS = {
  rookie: { name: "ROOKIE", color: "#8a857a", bg: "#e8e5de", exp: 0, next: "rally", icon: "🎾" },
  rally: { name: "RALLY", color: "#6B8E5B", bg: "#e8f0e4", exp: 500, next: "smash", icon: "🏃" },
  smash: { name: "SMASH", color: "#C39A4B", bg: "#f5eddc", exp: 1500, next: "ace", icon: "💥" },
  ace: { name: "ACE", color: "#003820", bg: "#d4e8dc", exp: 4000, next: null, icon: "👑" },
};

const fm = `'DM Mono', 'SF Mono', 'Fira Mono', monospace`;
const fs = `'DM Sans', -apple-system, 'Segoe UI', sans-serif`;

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [member, setMember] = useState(null);
  const [screen, setScreen] = useState("splash");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log("Initial session:", s ? "found" : "none");
      if (s) {
        setSession(s);
        loadMember(s.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log("Auth event:", event, s ? s.user.email : "no session");
      setSession(s);
      if (s && event === 'SIGNED_IN') {
        loadMember(s.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadMember = async (authId) => {
    console.log("Loading member for auth_id:", authId);
    try {
      const { data, error: err } = await supabase
        .from("members")
        .select("*")
        .eq("auth_id", authId)
        .maybeSingle();

      console.log("Member query result:", { data, err });

      if (err) {
        console.error("Member query error:", err);
        // RLS might block - try waiting and retry once
        await new Promise(r => setTimeout(r, 1000));
        const retry = await supabase.from("members").select("*").eq("auth_id", authId).maybeSingle();
        console.log("Retry result:", retry);
        if (retry.data) {
          setMember(retry.data);
          setScreen("home");
          setLoading(false);
          return;
        }
      }

      if (data) {
        setMember(data);
        setScreen("home");
      } else {
        console.log("No member found, showing onboarding");
        setScreen("onboarding");
      }
    } catch (e) {
      console.error("loadMember exception:", e);
      setScreen("onboarding");
    }
    setLoading(false);
  };

  const handleSignUp = async (email, password, fullName, phone, dob) => {
    setError("");
    setLoading(true);
    try {
      // Step 1: Sign up
      const { data: authData, error: authErr } = await supabase.auth.signUp({ email, password });
      console.log("SignUp result:", { authData, authErr });
      if (authErr) throw authErr;

      const userId = authData.user?.id;
      const sess = authData.session;
      if (!userId) throw new Error("Signup berhasil, silakan login manual.");

      // Step 2: If we have a session, register member
      if (sess) {
        console.log("Have session after signup, registering member...");
        const { data: memberData, error: rpcErr } = await supabase.rpc("register_member", {
          p_auth_id: userId,
          p_full_name: fullName,
          p_email: email,
          p_phone: phone || null,
          p_date_of_birth: dob || null,
        });
        console.log("Register RPC result:", { memberData, rpcErr });
        if (rpcErr) {
          console.error("RPC error:", rpcErr);
          // Member might already exist from a previous attempt
        }
        await loadMember(userId);
      } else {
        // No session = email confirmation required
        setError("Akun berhasil dibuat! Silakan login.");
        setScreen("login");
        setLoading(false);
      }
    } catch (e) {
      console.error("SignUp error:", e);
      setError(e.message || "Registrasi gagal");
      setLoading(false);
    }
  };

  const handleSignIn = async (email, password) => {
    setError("");
    setLoading(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      console.log("SignIn result:", { data, err });
      if (err) throw err;

      // Check if member exists
      const { data: memberData } = await supabase
        .from("members")
        .select("*")
        .eq("auth_id", data.user.id)
        .maybeSingle();

      console.log("Member after login:", memberData);

      if (memberData) {
        setMember(memberData);
        setScreen("home");
      } else {
        // User exists in auth but not in members table - this shouldn't happen normally
        // Try to show a helpful message
        setError("Akun ditemukan tapi profil member belum dibuat. Hubungi admin.");
        setScreen("login");
      }
    } catch (e) {
      console.error("SignIn error:", e);
      setError(e.message || "Login gagal");
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMember(null);
    setScreen("splash");
  };

  const refreshMember = async () => {
    if (member) {
      const { data } = await supabase.from("members").select("*").eq("id", member.id).maybeSingle();
      if (data) setMember(data);
    }
  };

  if (loading && screen === "splash") return <SplashScreen />;

  const mainScreens = ["home", "qr", "rewards", "history", "profile"];
  const isMain = mainScreens.includes(screen);

  return (
    <div style={{ minHeight: "100vh", background: "#F5F2E8", fontFamily: fs, maxWidth: 480, margin: "0 auto" }}>
      {screen === "splash" && <SplashScreen onNext={() => setScreen("onboarding")} />}
      {screen === "onboarding" && <OnboardingScreen onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} />}
      {screen === "login" && <LoginScreen onSignIn={handleSignIn} onGoRegister={() => { setError(""); setScreen("register"); }} error={error} loading={loading} />}
      {screen === "register" && <RegisterScreen onSignUp={handleSignUp} onGoLogin={() => { setError(""); setScreen("login"); }} error={error} loading={loading} />}

      {isMain && member && (
        <>
          <div style={{ paddingBottom: 80 }}>
            {screen === "home" && <HomeScreen member={member} />}
            {screen === "qr" && <QRScreen member={member} />}
            {screen === "rewards" && <RewardsScreen member={member} onRefresh={refreshMember} />}
            {screen === "history" && <HistoryScreen member={member} />}
            {screen === "profile" && <ProfileScreen member={member} onLogout={handleLogout} />}
          </div>
          <BottomNav active={screen} onNavigate={setScreen} />
        </>
      )}
    </div>
  );
}

// ============================================================
// SCREENS
// ============================================================

function SplashScreen({ onNext }) {
  useEffect(() => { if (onNext) { const t = setTimeout(onNext, 2500); return () => clearTimeout(t); } }, [onNext]);
  return (
    <div onClick={onNext} style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#003820", cursor: onNext ? "pointer" : "default", position: "relative", overflow: "hidden" }}>
      <DotPattern opacity={0.05} count={120} />
      <div style={{ fontFamily: fm, fontSize: 38, fontWeight: 500, color: "#E0DBBC", letterSpacing: 8, textAlign: "center", animation: "fadeUp 0.8s ease", position: "relative", zIndex: 1 }}>NOMONO</div>
      <div style={{ fontFamily: fm, fontSize: 10, color: "#C39A4B", letterSpacing: 6, textAlign: "center", marginTop: 8, position: "relative", zIndex: 1 }}>PADEL CLUB</div>
      <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

function OnboardingScreen({ onLogin, onRegister }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: "🎾", title: "Selamat Datang\ndi Nomono", desc: "Daftar jadi member dan nikmati berbagai benefit eksklusif setiap kali bermain padel." },
    { icon: "⚡", title: "Main & Kumpulkan\nEXP + Koin", desc: "Setiap transaksi mendapatkan EXP untuk naik tier dan Koin untuk ditukar reward." },
    { icon: "👑", title: "Naik Tier,\nMakin Banyak Benefit", desc: "Dari Rookie sampai Ace — makin tinggi tier, makin besar diskon dan benefit." },
  ];
  const s = steps[step];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#FAF8F2", padding: "0 0 40px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 32px 0" }}>
        <div style={{ width: 90, height: 90, borderRadius: 28, background: "linear-gradient(135deg, #003820, #005a35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, marginBottom: 28, boxShadow: "0 12px 40px #00382030" }}>{s.icon}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#231F20", textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-line" }}>{s.title}</div>
        <div style={{ fontSize: 14, color: "#6b6560", textAlign: "center", marginTop: 14, lineHeight: 1.6, maxWidth: 280 }}>{s.desc}</div>
      </div>
      <div style={{ padding: "0 32px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {steps.map((_, i) => (<div key={i} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, background: i === step ? "#003820" : "#ddd9cc", transition: "all 0.3s" }} />))}
        </div>
        {step < 2 ? (
          <Btn onClick={() => setStep(step + 1)}>LANJUT</Btn>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Btn onClick={onRegister}>DAFTAR MEMBER</Btn>
            <Btn variant="ghost" onClick={onLogin}>SUDAH PUNYA AKUN? LOGIN</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function LoginScreen({ onSignIn, onGoRegister, error, loading }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#FAF8F2" }}>
      <div style={{ padding: "60px 24px 0" }}>
        <div style={{ fontFamily: fm, fontSize: 10, color: "#6b6560", letterSpacing: 2 }}>MEMBER LOGIN</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#231F20", marginTop: 6 }}>Masuk ke Akun Nomono</div>
      </div>
      <div style={{ padding: "28px 24px", flex: 1 }}>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="email@contoh.com" />
        <Input label="Password" type="password" value={pw} onChange={setPw} placeholder="Masukkan password" />
        {error && <div style={{ color: "#c44", fontSize: 13, marginBottom: 12, fontFamily: fm }}>{error}</div>}
      </div>
      <div style={{ padding: "0 24px 40px" }}>
        <Btn onClick={() => onSignIn(email, pw)} disabled={loading || !email || !pw}>{loading ? "LOADING..." : "LOGIN"}</Btn>
        <Btn variant="ghost" onClick={onGoRegister} style={{ marginTop: 10 }}>BELUM PUNYA AKUN? DAFTAR</Btn>
      </div>
    </div>
  );
}

function RegisterScreen({ onSignUp, onGoLogin, error, loading }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [pw, setPw] = useState("");
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#FAF8F2" }}>
      <div style={{ padding: "60px 24px 0" }}>
        <div style={{ fontFamily: fm, fontSize: 10, color: "#6b6560", letterSpacing: 2 }}>DAFTAR MEMBER</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#231F20", marginTop: 6 }}>Buat Akun Nomono</div>
        <div style={{ fontSize: 13, color: "#6b6560", marginTop: 4 }}>Gratis — langsung jadi member Rookie.</div>
      </div>
      <div style={{ padding: "24px 24px", flex: 1, overflow: "auto" }}>
        <Input label="Nama Lengkap *" value={name} onChange={setName} placeholder="Masukkan nama lengkap" />
        <Input label="Email *" type="email" value={email} onChange={setEmail} placeholder="email@contoh.com" />
        <Input label="Password *" type="password" value={pw} onChange={setPw} placeholder="Min. 6 karakter" />
        <Input label="Nomor HP" type="tel" value={phone} onChange={setPhone} placeholder="+62 812 xxxx xxxx" />
        <Input label="Tanggal Lahir" type="date" value={dob} onChange={setDob} />
        {error && <div style={{ color: "#c44", fontSize: 13, marginBottom: 12, fontFamily: fm }}>{error}</div>}
      </div>
      <div style={{ padding: "0 24px 40px" }}>
        <Btn onClick={() => onSignUp(email, pw, name, phone, dob)} disabled={loading || !name || !email || !pw || pw.length < 6}>
          {loading ? "LOADING..." : "DAFTAR SEKARANG"}
        </Btn>
        <Btn variant="ghost" onClick={onGoLogin} style={{ marginTop: 10 }}>SUDAH PUNYA AKUN? LOGIN</Btn>
      </div>
    </div>
  );
}

function HomeScreen({ member }) {
  const [promos, setPromos] = useState([]);
  const tier = TIERS[member.tier] || TIERS.rookie;
  const nextTier = tier.next ? TIERS[tier.next] : null;
  const progress = nextTier ? ((member.total_exp - tier.exp) / (nextTier.exp - tier.exp)) * 100 : 100;

  useEffect(() => {
    supabase.from("promos").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setPromos(data); });
  }, []);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, #003820, #005a35)", padding: "52px 20px 24px", position: "relative", overflow: "hidden" }}>
        <DotPattern opacity={0.04} count={60} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: fm, fontSize: 10, color: "#E0DBBC", letterSpacing: 1.5, opacity: 0.7, marginBottom: 4 }}>SELAMAT DATANG</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{member.full_name?.split(" ")[0]}</div>
            </div>
            <TierBadge tier={member.tier} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <GlassCard label="TOTAL EXP" value={member.total_exp} color="#fff" labelColor="#E0DBBC" />
            <GlassCard label="KOIN" value={member.coin_balance} color="#C39A4B" labelColor="#C39A4B" />
          </div>
        </div>
      </div>

      {nextTier && (
        <div style={{ padding: "18px 20px 0" }}>
          <Card>
            <div style={{ fontFamily: fm, fontSize: 9, color: "#6b6560", letterSpacing: 1.5, marginBottom: 10 }}>PROGRESS KE TIER BERIKUTNYA</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "#6b6560", fontFamily: fm }}>{member.total_exp} EXP</span>
              <span style={{ fontSize: 10, color: "#a09a8a", fontFamily: fm }}>{nextTier.exp} → {nextTier.icon} {nextTier.name}</span>
            </div>
            <div style={{ height: 8, background: "#ddd9cc", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(progress, 100)}%`, background: `linear-gradient(90deg, ${tier.color}, ${nextTier.color})`, borderRadius: 10, transition: "width 1s" }} />
            </div>
            <div style={{ textAlign: "right", marginTop: 4 }}>
              <span style={{ fontSize: 10, color: "#a09a8a", fontFamily: fm }}>{nextTier.exp - member.total_exp} EXP lagi</span>
            </div>
          </Card>
        </div>
      )}

      <div style={{ padding: "14px 20px 0" }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: fm, fontSize: 9, color: "#6b6560", letterSpacing: 1.5 }}>MEMBER CODE</div>
              <div style={{ fontFamily: fm, fontSize: 18, fontWeight: 600, color: "#003820", marginTop: 2 }}>{member.member_code}</div>
            </div>
            <div style={{ fontSize: 11, color: "#6b6560", fontFamily: fm }}>Sejak {new Date(member.joined_at).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}</div>
          </div>
        </Card>
      </div>

      {promos.length > 0 && (
        <div style={{ padding: "18px 20px 24px" }}>
          <div style={{ fontFamily: fm, fontSize: 9, color: "#6b6560", letterSpacing: 1.5, marginBottom: 10 }}>PROMO & EVENT</div>
          {promos.map(p => (
            <div key={p.id} style={{ background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #ddd9cc", borderLeft: `4px solid ${p.color || "#003820"}`, marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#231F20", marginBottom: 3 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: "#6b6560" }}>{p.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QRScreen({ member }) {
  const [qrData, setQrData] = useState(null);
  const [countdown, setCountdown] = useState(60);

  const generateQR = async () => {
    const { data, error } = await supabase.rpc("generate_qr_token", { p_member_id: member.id });
    if (data?.token) { setQrData(data); setCountdown(60); }
  };

  useEffect(() => {
    generateQR();
    const iv = setInterval(() => {
      setCountdown(prev => { if (prev <= 1) { generateQR(); return 60; } return prev - 1; });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const token = qrData?.token || "";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#FAF8F2" }}>
      <div style={{ padding: "52px 20px 14px", textAlign: "center" }}>
        <div style={{ fontFamily: fm, fontSize: 10, color: "#6b6560", letterSpacing: 2 }}>MEMBER QR CODE</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#231F20", marginTop: 4 }}>Tunjukkan ke kasir saat transaksi</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px" }}>
        <div style={{ width: "100%", maxWidth: 340, background: "#fff", borderRadius: 24, padding: "28px 22px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,56,32,0.1)", border: "1px solid #ddd9cc" }}>
          <TierBadge tier={member.tier} />
          <div style={{ fontFamily: fm, fontSize: 11, color: "#a09a8a", marginTop: 4 }}>{member.member_code}</div>
          <div style={{ width: 200, height: 200, margin: "22px auto", borderRadius: 16, border: "2px solid #00382020", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="180" height="180" viewBox="0 0 180 180">
              <rect x="10" y="10" width="40" height="40" rx="4" fill="#003820"/><rect x="16" y="16" width="28" height="28" rx="2" fill="#fff"/><rect x="22" y="22" width="16" height="16" rx="1" fill="#003820"/>
              <rect x="130" y="10" width="40" height="40" rx="4" fill="#003820"/><rect x="136" y="16" width="28" height="28" rx="2" fill="#fff"/><rect x="142" y="22" width="16" height="16" rx="1" fill="#003820"/>
              <rect x="10" y="130" width="40" height="40" rx="4" fill="#003820"/><rect x="16" y="136" width="28" height="28" rx="2" fill="#fff"/><rect x="22" y="142" width="16" height="16" rx="1" fill="#003820"/>
              {token && Array.from({ length: 100 }).map((_, i) => {
                const x = 58 + (i % 10) * 8, y = 58 + Math.floor(i / 10) * 8;
                const c = token.charCodeAt(i % token.length) || 0;
                return c % 3 !== 0 ? <rect key={i} x={x} y={y} width="5" height="5" rx="1" fill="#003820" opacity={0.85}/> : null;
              })}
              <circle cx="90" cy="90" r="14" fill="#fff"/><circle cx="90" cy="90" r="10" fill="#003820"/>
              <text x="90" y="94" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700" fontFamily={fm}>N</text>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#231F20" }}>{member.full_name}</div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="12" cy="12" r="10" fill="none" stroke="#ddd9cc" strokeWidth="2"/>
              <circle cx="12" cy="12" r="10" fill="none" stroke={countdown <= 10 ? "#c44" : "#003820"} strokeWidth="2" strokeDasharray={`${(countdown/60)*62.8} 62.8`} strokeLinecap="round"/>
            </svg>
            <span style={{ fontFamily: fm, fontSize: 12, color: countdown <= 10 ? "#c44" : "#6b6560" }}>Refresh {countdown}s</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "12px 28px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#a09a8a", fontFamily: fm }}>QR dinamis • auto-refresh 60 detik</div>
      </div>
    </div>
  );
}

function RewardsScreen({ member, onRefresh }) {
  const [rewards, setRewards] = useState([]);
  const [filter, setFilter] = useState("all");
  const [redeeming, setRedeeming] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("reward_catalog").select("*").eq("is_active", true).order("coin_cost")
      .then(({ data }) => { if (data) setRewards(data); });
  }, []);

  const handleRedeem = async (reward) => {
    if (member.coin_balance < reward.coin_cost) return;
    setRedeeming(reward.id); setMsg("");
    const { data, error } = await supabase.rpc("redeem_reward", { p_member_id: member.id, p_reward_id: reward.id });
    if (data?.voucher_code) { setMsg(`Berhasil! Voucher: ${data.voucher_code}`); onRefresh(); }
    else setMsg(error?.message || "Gagal redeem");
    setRedeeming(null);
  };

  const cats = ["all", "fnb", "court", "training", "merch"];
  const filtered = filter === "all" ? rewards : rewards.filter(r => r.category === filter);

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F2" }}>
      <div style={{ padding: "52px 20px 0" }}>
        <div style={{ fontFamily: fm, fontSize: 10, color: "#6b6560", letterSpacing: 2 }}>TUKAR KOIN</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#231F20", marginTop: 4 }}>Rewards Catalog</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, background: "linear-gradient(135deg, #003820, #005a35)", borderRadius: 14, padding: "14px 18px" }}>
          <div style={{ fontSize: 26 }}>🪙</div>
          <div>
            <div style={{ fontFamily: fm, fontSize: 9, color: "#E0DBBC", letterSpacing: 1.5, opacity: 0.7 }}>SALDO KOIN</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#C39A4B", fontFamily: fm }}>{member.coin_balance}</div>
          </div>
        </div>
        {msg && <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, background: msg.includes("Berhasil") ? "#e8f0e4" : "#ffeaea", color: msg.includes("Berhasil") ? "#2a8a50" : "#c44", fontSize: 12, fontFamily: fm }}>{msg}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 14, overflowX: "auto" }}>
          {cats.map(c => (
            <button key={c} onClick={() => setFilter(c)} style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: fm, fontSize: 11, whiteSpace: "nowrap", background: filter === c ? "#003820" : "#fff", color: filter === c ? "#fff" : "#6b6560", boxShadow: filter === c ? "none" : "inset 0 0 0 1px #ddd9cc" }}>
              {c === "all" ? "Semua" : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "14px 20px 20px" }}>
        {filtered.map(r => {
          const ok = member.coin_balance >= r.coin_cost;
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 14, padding: "14px 16px", border: "1px solid #ddd9cc", marginBottom: 8, opacity: ok ? 1 : 0.5 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "#F5F2E8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{r.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#231F20" }}>{r.name}</div>
                <div style={{ fontFamily: fm, fontSize: 11, color: "#C39A4B", marginTop: 2, fontWeight: 600 }}>🪙 {r.coin_cost}</div>
              </div>
              <button onClick={() => handleRedeem(r)} disabled={!ok || redeeming === r.id} style={{ padding: "7px 14px", borderRadius: 10, border: "none", background: ok ? "#003820" : "#ddd9cc", color: ok ? "#fff" : "#a09a8a", fontFamily: fm, fontSize: 10, fontWeight: 600, cursor: ok ? "pointer" : "default" }}>
                {redeeming === r.id ? "..." : "TUKAR"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryScreen({ member }) {
  const [txs, setTxs] = useState([]);
  const icons = { court_prime: "🎾", court_offpeak: "🎾", fnb: "☕", coaching: "🏆", robot_ball: "🤖", merchandise: "🎁", other: "📋" };

  useEffect(() => {
    supabase.from("transactions").select("*").eq("member_id", member.id).order("created_at", { ascending: false }).limit(30)
      .then(({ data }) => { if (data) setTxs(data); });
  }, []);

  const thisMonth = txs.filter(t => new Date(t.created_at).getMonth() === new Date().getMonth());
  const totalExp = thisMonth.reduce((s, t) => s + (t.exp_earned || 0), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F2" }}>
      <div style={{ padding: "52px 20px 14px" }}>
        <div style={{ fontFamily: fm, fontSize: 10, color: "#6b6560", letterSpacing: 2 }}>AKTIVITAS</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#231F20", marginTop: 4 }}>Riwayat Transaksi</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid #ddd9cc" }}>
            <div style={{ fontFamily: fm, fontSize: 9, color: "#a09a8a" }}>BULAN INI</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#003820", fontFamily: fm, marginTop: 2 }}>+{totalExp}</div>
            <div style={{ fontFamily: fm, fontSize: 9, color: "#a09a8a" }}>EXP earned</div>
          </div>
          <div style={{ flex: 1, background: "#fff", borderRadius: 12, padding: "12px 14px", border: "1px solid #ddd9cc" }}>
            <div style={{ fontFamily: fm, fontSize: 9, color: "#a09a8a" }}>KUNJUNGAN</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#C39A4B", fontFamily: fm, marginTop: 2 }}>{thisMonth.length}x</div>
            <div style={{ fontFamily: fm, fontSize: 9, color: "#a09a8a" }}>bulan ini</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 20px 20px" }}>
        {txs.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#a09a8a", fontFamily: fm }}>Belum ada transaksi</div>}
        {txs.map((t, i) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: i < txs.length - 1 ? "1px solid #f0ede4" : "none" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F5F2E8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icons[t.category] || "📋"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#231F20" }}>{t.description || t.category}</div>
              <div style={{ fontFamily: fm, fontSize: 10, color: "#a09a8a", marginTop: 2 }}>{new Date(t.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: fm, fontSize: 11, color: "#003820", fontWeight: 600 }}>+{t.exp_earned} EXP</div>
              <div style={{ fontFamily: fm, fontSize: 11, color: "#C39A4B", fontWeight: 600 }}>+{t.coins_earned} 🪙</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileScreen({ member, onLogout }) {
  const allTiers = ["rookie", "rally", "smash", "ace"];
  return (
    <div style={{ minHeight: "100vh", background: "#FAF8F2" }}>
      <div style={{ background: "linear-gradient(135deg, #003820, #005a35)", padding: "52px 20px 28px", textAlign: "center", position: "relative" }}>
        <DotPattern opacity={0.04} count={50} />
        <div style={{ position: "relative" }}>
          <div style={{ width: 68, height: 68, borderRadius: "50%", margin: "0 auto", background: "#E0DBBC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700, color: "#003820", fontFamily: fm, border: "3px solid #C39A4B40" }}>
            {member.full_name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 10 }}>{member.full_name}</div>
          <div style={{ fontFamily: fm, fontSize: 11, color: "#E0DBBC", opacity: 0.7, marginTop: 3 }}>{member.member_code}</div>
          <div style={{ marginTop: 8 }}><TierBadge tier={member.tier} /></div>
        </div>
      </div>
      <div style={{ padding: "18px 20px 24px" }}>
        <Card>
          <div style={{ fontFamily: fm, fontSize: 9, color: "#6b6560", letterSpacing: 1.5, marginBottom: 12 }}>INFORMASI MEMBER</div>
          {[
            { l: "Email", v: member.email },
            { l: "Telepon", v: member.phone || "-" },
            { l: "Sejak", v: new Date(member.joined_at).toLocaleDateString("id-ID", { month: "long", year: "numeric" }) },
            { l: "Total EXP", v: `${member.total_exp}` },
            { l: "Saldo Koin", v: `${member.coin_balance}` },
          ].map((item, i, a) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: i < a.length - 1 ? "1px solid #f0ede4" : "none" }}>
              <span style={{ fontSize: 12, color: "#6b6560" }}>{item.l}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#231F20", fontFamily: fm }}>{item.v}</span>
            </div>
          ))}
        </Card>
        <Card style={{ marginTop: 14 }}>
          <div style={{ fontFamily: fm, fontSize: 9, color: "#6b6560", letterSpacing: 1.5, marginBottom: 14 }}>TIER ROADMAP</div>
          {allTiers.map((tKey, i) => {
            const t = TIERS[tKey];
            const isPast = allTiers.indexOf(member.tier) >= i;
            const isCurr = member.tier === tKey;
            return (
              <div key={tKey} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22 }}>
                  <div style={{ width: isCurr ? 18 : 12, height: isCurr ? 18 : 12, borderRadius: "50%", background: isPast ? t.color : "#ddd9cc", flexShrink: 0, border: isCurr ? `3px solid ${t.color}30` : "none" }} />
                  {i < 3 && <div style={{ width: 2, height: 28, background: isPast ? `${t.color}40` : "#ddd9cc" }} />}
                </div>
                <div style={{ flex: 1, paddingBottom: i < 3 ? 16 : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 13 }}>{t.icon}</span>
                    <span style={{ fontFamily: fm, fontSize: 12, fontWeight: 700, color: isPast ? t.color : "#a09a8a", letterSpacing: 1 }}>{t.name}</span>
                    {isCurr && <span style={{ fontFamily: fm, fontSize: 8, background: t.color, color: "#fff", padding: "2px 6px", borderRadius: 4 }}>ANDA</span>}
                  </div>
                  <div style={{ fontFamily: fm, fontSize: 10, color: "#a09a8a", marginTop: 2 }}>{t.exp === 0 ? "Default" : `${t.exp} EXP`}</div>
                </div>
              </div>
            );
          })}
        </Card>
        <button onClick={onLogout} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 12, border: "1px solid #ddd9cc", background: "#fff", color: "#c44", fontFamily: fm, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>LOGOUT</button>
      </div>
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================

function BottomNav({ active, onNavigate }) {
  const items = [
    { id: "home", label: "Home", d: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" },
    { id: "qr", label: "My QR", d: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3z" },
    { id: "rewards", label: "Rewards", d: "M12 2a6 6 0 016 6c0 3-2 5.3-6 8-4-2.7-6-5-6-8a6 6 0 016-6z" },
    { id: "history", label: "Riwayat", d: "M12 2a10 10 0 1010 10A10 10 0 0012 2zM12 6v6l4 2" },
    { id: "profile", label: "Profile", d: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 110 8 4 4 0 010-8z" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, height: 72, background: "#fff", display: "flex", borderTop: "1px solid #ddd9cc", zIndex: 999, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map(item => (
        <button key={item.id} onClick={() => onNavigate(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: "none", border: "none", cursor: "pointer" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active === item.id ? "#003820" : "#a09a8a"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={item.d}/></svg>
          <span style={{ fontSize: 10, fontFamily: fm, color: active === item.id ? "#003820" : "#a09a8a", fontWeight: active === item.id ? 600 : 400 }}>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function TierBadge({ tier }) {
  const t = TIERS[tier] || TIERS.rookie;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: t.bg, color: t.color, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontFamily: fm, fontWeight: 600, letterSpacing: 1.2, border: `1.5px solid ${t.color}22` }}>{t.icon} {t.name}</span>;
}

function GlassCard({ label, value, color, labelColor }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ fontFamily: fm, fontSize: 9, color: labelColor, letterSpacing: 1.5, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, marginTop: 2, fontFamily: fm }}>{value}</div>
    </div>
  );
}

function Card({ children, style = {} }) {
  return <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #ddd9cc", boxShadow: "0 2px 12px rgba(0,56,32,0.04)", ...style }}>{children}</div>;
}

function DotPattern({ opacity = 0.04, count = 60 }) {
  return (
    <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ position: "absolute", width: 3, height: 3, borderRadius: "50%", background: "#fff", left: `${(i % 10) * 10 + 2}%`, top: `${Math.floor(i / 10) * 12 + 3}%` }} />
      ))}
    </div>
  );
}

function Input({ label, type = "text", value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontFamily: fm, fontSize: 10, color: "#6b6560", letterSpacing: 1, display: "block", marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1.5px solid #ddd9cc", background: "#fff", fontSize: 14, color: "#231F20", outline: "none", boxSizing: "border-box" }}
        onFocus={e => e.target.style.borderColor = "#003820"} onBlur={e => e.target.style.borderColor = "#ddd9cc"} />
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", style = {} }) {
  const p = variant === "primary";
  return <button onClick={onClick} disabled={disabled} style={{ width: "100%", padding: "15px", borderRadius: 14, border: p ? "none" : "1px solid #ddd9cc", background: p ? (disabled ? "#a09a8a" : "#003820") : "transparent", color: p ? "#fff" : "#003820", fontSize: 14, fontWeight: 600, fontFamily: fm, letterSpacing: 1, cursor: disabled ? "default" : "pointer", ...style }}>{children}</button>;
}

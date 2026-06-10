// Tiny i18n: English is the default; Indonesian is the optional language.
// Language is auto-detected from Telegram / the browser and can be toggled.

import { useEffect, useState } from 'react';

export type Lang = 'en' | 'id';

const en = {
    appTitle: "Tom",
    tagline: "A shared voxel island on The Open Network.\nScan the QR with Tom Passport (Telegram).",
    checkingSession: "Checking session…",
    tmaLoggingIn: "Signing in with Telegram…",
    tmaFailed: "Telegram sign-in failed. The server may be missing its BOT_TOKEN.",
    generateQR: "Generate Login QR",
    waitingScan: "Waiting for scan…",
    qrExpired: "QR expired. Try again.",
    qrFailed: "Could not create a QR. Is the server running at",
    orInvite: "or join with an invite code",
    yourName: "Your name",
    inviteCode: "Invite code",
    joinWorld: "Join the world",
    inviteFailed: "Invalid invite code.",
    loginGuest: "Enter as guest (dev mode)",
    noPassport: "Don't have Tom Passport?",
    openBot: "Open the Telegram bot →",
    language: "Bahasa Indonesia",
    disconnected: "Disconnected — reconnecting…",
    logout: "Leave",
    chatPlaceholder: "Type a message…",
    hintWalk: "WASD/joystick: walk · drag: rotate camera",
    hintBuild: "Tap to place a block",
    hintRemove: "Tap a block to remove it",
    removeTool: "Remove blocks",
    block_1: "Grass", block_2: "Dirt", block_3: "Stone", block_4: "Wood", block_5: "Leaves",
    block_6: "White", block_7: "Red", block_8: "Orange", block_9: "Yellow", block_10: "Lime",
    block_11: "Blue", block_12: "Purple", block_13: "Pink", block_14: "Cyan", block_15: "Charcoal",
};

const id: typeof en = {
    appTitle: "Tom",
    tagline: "Pulau voxel bersama di The Open Network.\nScan QR dengan Tom Passport (Telegram).",
    checkingSession: "Memeriksa sesi…",
    tmaLoggingIn: "Masuk dengan Telegram…",
    tmaFailed: "Login Telegram gagal. Server mungkin belum diisi BOT_TOKEN.",
    generateQR: "Buat QR Login",
    waitingScan: "Menunggu scan…",
    qrExpired: "QR kedaluwarsa. Coba lagi.",
    qrFailed: "Gagal membuat QR. Server jalan di",
    orInvite: "atau masuk dengan kode undangan",
    yourName: "Namamu",
    inviteCode: "Kode undangan",
    joinWorld: "Masuk ke dunia",
    inviteFailed: "Kode undangan tidak valid.",
    loginGuest: "Masuk sebagai tamu (mode dev)",
    noPassport: "Belum punya Tom Passport?",
    openBot: "Buka bot Telegram →",
    language: "English",
    disconnected: "Terputus — menyambung ulang…",
    logout: "Keluar",
    chatPlaceholder: "Ketik pesan…",
    hintWalk: "WASD/joystick: jalan · seret: putar kamera",
    hintBuild: "Ketuk untuk memasang blok",
    hintRemove: "Ketuk blok untuk menghapus",
    removeTool: "Hapus blok",
    block_1: "Rumput", block_2: "Tanah", block_3: "Batu", block_4: "Kayu", block_5: "Daun",
    block_6: "Putih", block_7: "Merah", block_8: "Oranye", block_9: "Kuning", block_10: "Hijau Muda",
    block_11: "Biru", block_12: "Ungu", block_13: "Pink", block_14: "Cyan", block_15: "Arang",
};

export type TKey = keyof typeof en;

const dicts: Record<Lang, typeof en> = { en, id };

function detectLang(): Lang {
    const saved = localStorage.getItem('tom_lang');
    if (saved === 'en' || saved === 'id') return saved;
    const tgLang: string | undefined =
        (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    const nav = tgLang ?? navigator.language ?? 'en';
    return nav.toLowerCase().startsWith('id') ? 'id' : 'en';
}

let current: Lang = detectLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
    return current;
}

export function setLang(l: Lang) {
    current = l;
    localStorage.setItem('tom_lang', l);
    listeners.forEach(fn => fn());
}

export function t(key: TKey): string {
    return dicts[current][key] ?? dicts.en[key] ?? key;
}

// Re-renders the component when the language changes.
export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string } {
    const [, bump] = useState(0);
    useEffect(() => {
        const fn = () => bump(n => n + 1);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);
    return { lang: current, setLang, t };
}

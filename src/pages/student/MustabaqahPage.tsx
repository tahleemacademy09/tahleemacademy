/*
  MustabaqahPage.tsx \u2014 Tahleem Academy
  Enhanced mobile-first redesign with animated Islamic background
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Bell, Play,
  Trophy, Users, Plus, Crown, Clock, Star, BookOpen,
  CheckCircle, RefreshCw, ChevronRight,
  Shuffle, Award, Radio, Flag, ArrowRight,
  LogIn, Settings, StopCircle, Loader2, PhoneCall,
  Hash, LayoutGrid, List, Eye, Volume2, Medal,
} from "lucide-react";

/* \u2500\u2500 Brand \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
const G    = "#0f2d1f";
const GM   = "#163d28";
const GD   = "#0a1f12";
const GOLD = "#c9a84c";
const GOLDD= "#a8843a";
const RED  = "#ef4444";
const GREEN= "#22c55e";

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   GLOBAL STYLES (injected once)
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Amiri:wght@400;700&family=Cinzel:wght@400;600;700;900&display=swap');

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    @keyframes rotatePattern {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes floatUp {
      0%   { transform: translateY(0px) scale(1);   opacity: 0.6; }
      50%  { transform: translateY(-12px) scale(1.02); opacity: 1; }
      100% { transform: translateY(0px) scale(1);   opacity: 0.6; }
    }
    @keyframes goldShimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes pulseRing {
      0%   { transform: scale(1);   opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes bellSwing {
      0%,100% { transform: rotate(0deg); }
      20%     { transform: rotate(-20deg); }
      40%     { transform: rotate(20deg); }
      60%     { transform: rotate(-12deg); }
      80%     { transform: rotate(8deg); }
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes recitingGlow {
      0%,100% { box-shadow: 0 0 20px rgba(34,197,94,0.4); }
      50%     { box-shadow: 0 0 40px rgba(34,197,94,0.8), 0 0 80px rgba(34,197,94,0.3); }
    }
    @keyframes calledGlow {
      0%,100% { box-shadow: 0 0 20px rgba(201,168,76,0.5); }
      50%     { box-shadow: 0 0 50px rgba(201,168,76,0.9), 0 0 100px rgba(201,168,76,0.4); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ripple {
      0%   { transform: scale(0); opacity: 1; }
      100% { transform: scale(4); opacity: 0; }
    }
    @keyframes staggerIn {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .anim-slide-up { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
    .anim-fade     { animation: fadeIn 0.3s ease both; }

    .gold-btn {
      background: linear-gradient(135deg, #c9a84c 0%, #e8c96a 40%, #c9a84c 60%, #a8843a 100%);
      background-size: 200% auto;
      transition: background-position 0.4s, transform 0.15s, box-shadow 0.15s;
    }
    .gold-btn:hover  { background-position: right center; transform: translateY(-1px); box-shadow: 0 8px 32px rgba(201,168,76,0.5); }
    .gold-btn:active { transform: scale(0.97); }

    .glass-card {
      background: rgba(22,61,40,0.55);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(201,168,76,0.18);
    }

    .participant-row { transition: transform 0.15s, box-shadow 0.15s; }
    .participant-row:active { transform: scale(0.99); }

    .bell-btn:active { animation: bellSwing 0.5s ease; }

    input, select, textarea {
      font-family: 'Cairo', sans-serif !important;
    }
    input:focus, select:focus {
      outline: none;
      border-color: rgba(201,168,76,0.7) !important;
      box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
    }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.3); border-radius: 2px; }

    .stagger-1 { animation: staggerIn 0.4s 0.05s both; }
    .stagger-2 { animation: staggerIn 0.4s 0.10s both; }
    .stagger-3 { animation: staggerIn 0.4s 0.15s both; }
    .stagger-4 { animation: staggerIn 0.4s 0.20s both; }
    .stagger-5 { animation: staggerIn 0.4s 0.25s both; }
  `}</style>
);

/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   ANIMATED ISLAMIC BACKGROUND
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
const IslamicBackground = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
    {/* Deep gradient base */}
    <div style={{
      position: "absolute", inset: 0,
      background: `radial-gradient(ellipse at 20% 20%, #1a4a2e 0%, ${GD} 40%, #050f09 100%)`,
    }}/>

    {/* Rotating star pattern \u2014 slow outer */}
    <svg style={{
      position: "absolute", top: "50%", left: "50%",
      width: "180vmax", height: "180vmax",
      transform: "translate(-50%,-50%)",
      opacity: 0.045,
      animation: "rotatePattern 120s linear infinite",
    }} viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="star8" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
          <polygon points="50,5 58,35 88,35 65,55 73,85 50,67 27,85 35,55 12,35 42,35"
            fill="none" stroke={GOLD} strokeWidth="0.8"/>
          <polygon points="50,15 56,33 75,33 61,44 66,63 50,54 34,63 39,44 25,33 44,33"
            fill="none" stroke={GOLD} strokeWidth="0.4" opacity="0.6"/>
          <circle cx="50" cy="50" r="4" fill="none" stroke={GOLD} strokeWidth="0.5"/>
          <circle cx="50" cy="50" r="12" fill="none" stroke={GOLD} strokeWidth="0.3" opacity="0.5"/>
          <line x1="0" y1="50" x2="100" y2="50" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
          <line x1="50" y1="0" x2="50" y2="100" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
          <line x1="0" y1="0" x2="100" y2="100" stroke={GOLD} strokeWidth="0.15" opacity="0.25"/>
          <line x1="100" y1="0" x2="0" y2="100" stroke={GOLD} strokeWidth="0.15" opacity="0.25"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#star8)"/>
    </svg>

    {/* Counter-rotating inner ring */}
    <svg style={{
      position: "
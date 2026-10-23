import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const EMOJIS = ["❤️", "😂", "😮", "😢", "🤲", "👍"];

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface MessageReactionsProps {
  messageId: string;
  reactions: Record<string, string[]>;
  onReactionUpdate: () => void;
}

const MessageReactions = ({ messageId, reactions, onReactionUpdate }: MessageReactionsProps) => {
  const { user } = useAuth();
  const [showPicker, setShowPicker] = useState(false);

  const grouped: Reaction[] = EMOJIS.map(emoji => ({
    emoji,
    count: (reactions[emoji] || []).length,
    reacted: (reactions[emoji] || []).includes(user?.id || ""),
  })).filter(r => r.count > 0);

  const toggleReaction = async (emoji: string) => {
    if (!user) return;
    const hasReacted = (reactions[emoji] || []).includes(user.id);
    if (hasReacted) {
      await supabase.from("message_reactions" as any)
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", user.id)
        .eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions" as any)
        .upsert({ message_id: messageId, user_id: user.id, emoji });
    }
    setShowPicker(false);
    onReactionUpdate();
  };

  return (
    <div className="relative">
      {grouped.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {grouped.map(r => (
            <button
              key={r.emoji}
              onClick={() => toggleReaction(r.emoji)}
              className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                r.reacted
                  ? "border-green-400 bg-green-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <span>{r.emoji}</span>
              <span className="text-[10px] font-medium">{r.count}</span>
            </button>
          ))}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="px-1.5 py-0.5 rounded-full text-xs border border-gray-200 bg-white hover:bg-gray-50 text-gray-400"
          >
            +
          </button>
        </div>
      )}

      {showPicker && (
        <div className="absolute bottom-8 left-0 bg-white rounded-full shadow-lg border px-2 py-1 flex gap-1 z-50">
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => toggleReaction(emoji)}
              className="text-lg hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageReactions;

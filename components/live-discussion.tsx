"use client";

import { useState, useRef, useEffect } from "react";
import { Send, MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UserBet {
  side: "yes" | "no";
  amount: number;
}

interface DiscussionMessage {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  message: string;
  timestamp: Date;
  bet?: UserBet;
}

interface LiveDiscussionProps {
  messages: DiscussionMessage[];
  onSendMessage?: (message: string) => void;
  className?: string;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function formatAmount(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

function BetBadge({ bet }: { bet: UserBet }) {
  const isYes = bet.side === "yes";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        isYes
          ? "bg-neon-green/20 text-neon-green border border-neon-green/30"
          : "bg-neon-red/20 text-neon-red border border-neon-red/30"
      )}
    >
      {isYes ? "YES" : "NO"} {formatAmount(bet.amount)} P
    </span>
  );
}

function MessageItem({ message }: { message: DiscussionMessage }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={message.avatar} alt={message.username} />
        <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
          {message.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-medium text-sm text-foreground">
            {message.username}
          </span>
          {message.bet && <BetBadge bet={message.bet} />}
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
        <p className="text-sm text-foreground/90 break-words">
          {message.message}
        </p>
      </div>
    </div>
  );
}

export function LiveDiscussion({
  messages,
  onSendMessage,
  className,
}: LiveDiscussionProps) {
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (newMessage.trim() && onSendMessage) {
      onSendMessage(newMessage.trim());
      setNewMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card rounded-xl border border-border/50",
        className
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <MessageCircle className="size-5 text-neon-blue" />
        <h3 className="font-semibold text-foreground">실시간 토론</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {messages.length}개의 메시지
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="size-12 rounded-full bg-secondary flex items-center justify-center mb-3">
              <MessageCircle className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">아직 메시지가 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">
              첫 번째로 의견을 나눠보세요!
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="p-3 border-t border-border/50">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="의견을 공유해주세요..."
            className="flex-1 bg-input border-border/50 focus-visible:border-neon-blue/50 focus-visible:ring-neon-blue/20"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim()}
            size="icon"
            className="bg-neon-blue hover:bg-neon-blue/80 text-primary-foreground shrink-0"
          >
            <Send className="size-4" />
            <span className="sr-only">메시지 보내기</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

interface Message {
  id: number;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export default function MessagingSystem({ receiverId }: { receiverId: string }) {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState("");
  const queryClient = useQueryClient();

  // Fetch messages
  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", receiverId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/${receiverId}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "");
      }
      return res.json();
    },
    refetchInterval: 3000, // Poll every 3 seconds for real-time feel
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: user?.id,
          receiverId,
          content,
        }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || error.error || "");
      }
      return res.json();
    },
    onSuccess: () => {
      setNewMessage("");
      queryClient.invalidateQueries({ queryKey: ["messages", receiverId] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMessage.mutate(newMessage);
  };

  if (isLoading) return <div className="p-4 text-center text-gray-500">Loading conversation...</div>;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Dr. Emily Chen</h3>
            <p className="text-xs text-green-600 font-medium">Online Now</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 bg-gray-50/50">
        <div className="space-y-4">
          {messages?.map((msg: Message) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div 
                key={msg.id} 
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div 
                  className={`max-w-[75%] p-3 rounded-2xl shadow-sm ${
                    isMe 
                      ? "bg-red-700 text-white rounded-br-none" 
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-none"
                  }`}
                >
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <p className={`text-[10px] mt-1 text-right ${isMe ? "text-red-100" : "text-gray-400"}`}>
                    {format(new Date(msg.timestamp), "h:mm a")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <form onSubmit={handleSend} className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-full border border-gray-200 focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-100 transition-all">
          <Button type="button" variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 rounded-full">
            <Paperclip className="w-5 h-5" />
          </Button>
          
          <Input 
            placeholder="Type your message..." 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 border-none bg-transparent focus-visible:ring-0 placeholder:text-gray-400"
          />
          
          <Button type="button" variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600 rounded-full">
            <Smile className="w-5 h-5" />
          </Button>

          <Button 
            type="submit" 
            size="icon" 
            className="bg-red-700 hover:bg-red-800 text-white rounded-full w-10 h-10 shadow-md hover:shadow-lg transition-all"
            disabled={!newMessage.trim()}
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

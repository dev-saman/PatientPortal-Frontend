import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Plus, Paperclip, Send, MoreVertical, Phone, Video, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Message {
  id: number;
  sender: string;
  role: string;
  avatar: string;
  content: string;
  time: string;
  isMe: boolean;
}

interface Thread {
  id: number;
  subject: string;
  provider: string;
  role: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: boolean;
  category: "General" | "Clinical" | "Billing" | "Urgent";
  messages: Message[];
}

const mockThreads: Thread[] = [
  {
    id: 1,
    subject: "Follow-up on Lab Results",
    provider: "Dr. Sarah Wilson",
    role: "Neurologist",
    avatar: "SW",
    lastMessage: "Your results look stable. Let's discuss at your next visit.",
    time: "10:30 AM",
    unread: true,
    category: "Clinical",
    messages: [
      { id: 1, sender: "Me", role: "Patient", avatar: "ME", content: "Hi Dr. Wilson, I saw my lab results posted. Should I be concerned about the elevated levels?", time: "Yesterday, 2:15 PM", isMe: true },
      { id: 2, sender: "Dr. Sarah Wilson", role: "Neurologist", avatar: "SW", content: "Hello! I've reviewed them and everything is within expected range for your treatment plan.", time: "Yesterday, 4:30 PM", isMe: false },
      { id: 3, sender: "Dr. Sarah Wilson", role: "Neurologist", avatar: "SW", content: "Your results look stable. Let's discuss at your next visit.", time: "Today, 10:30 AM", isMe: false }
    ]
  },
  {
    id: 2,
    subject: "Question about Billing",
    provider: "Billing Department",
    role: "Admin",
    avatar: "BD",
    lastMessage: "We have received your payment. Thank you.",
    time: "Yesterday",
    unread: false,
    category: "Billing",
    messages: [
      { id: 1, sender: "Me", role: "Patient", avatar: "ME", content: "I think I was double charged for my last visit copay.", time: "Oct 12, 9:00 AM", isMe: true },
      { id: 2, sender: "Billing Department", role: "Admin", avatar: "BD", content: "Let me check that for you. One moment please.", time: "Oct 12, 9:15 AM", isMe: false },
      { id: 3, sender: "Billing Department", role: "Admin", avatar: "BD", content: "We have received your payment. Thank you.", time: "Yesterday, 11:00 AM", isMe: false }
    ]
  },
  {
    id: 3,
    subject: "Appointment Reschedule",
    provider: "Front Desk",
    role: "Scheduling",
    avatar: "FD",
    lastMessage: "Your appointment has been moved to next Tuesday.",
    time: "Oct 10",
    unread: false,
    category: "General",
    messages: [
      { id: 1, sender: "Me", role: "Patient", avatar: "ME", content: "Can I move my appointment to next week?", time: "Oct 10, 8:00 AM", isMe: true },
      { id: 2, sender: "Front Desk", role: "Scheduling", avatar: "FD", content: "Your appointment has been moved to next Tuesday.", time: "Oct 10, 9:30 AM", isMe: false }
    ]
  }
];

export default function Messages() {
  const [selectedThreadId, setSelectedThreadId] = useState<number>(1);
  const [newMessage, setNewMessage] = useState("");
  
  const selectedThread = mockThreads.find(t => t.id === selectedThreadId) || mockThreads[0];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    // Safety Gate Logic
    const emergencyKeywords = ["chest pain", "shortness of breath", "suicide", "stroke", "bleeding"];
    const hasEmergencyKeyword = emergencyKeywords.some(keyword => newMessage.toLowerCase().includes(keyword));

    if (hasEmergencyKeyword) {
      toast.error("Emergency Content Detected", {
        description: "Please call 911 immediately. The portal is not for emergencies.",
        duration: 5000
      });
      return;
    }

    toast.success("Message sent securely");
    setNewMessage("");
  };

  return (
    <div className="h-[calc(100vh-12rem)] min-h-[600px] grid grid-cols-1 md:grid-cols-[350px_1fr] gap-6">
      {/* Thread List */}
      <Card className="flex flex-col h-full shadow-soft">
        <div className="p-4 border-b space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Messages</h2>
            <Button size="icon" variant="ghost">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search messages..." className="pl-8" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {mockThreads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThreadId(thread.id)}
                className={`flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50 ${
                  selectedThreadId === thread.id ? "bg-muted" : ""
                }`}
              >
                <Avatar>
                  <AvatarFallback className={thread.unread ? "bg-primary text-primary-foreground" : ""}>
                    {thread.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium truncate ${thread.unread ? "text-foreground" : "text-muted-foreground"}`}>
                      {thread.provider}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {thread.time}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate mb-1">
                    {thread.subject}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {thread.lastMessage}
                  </div>
                </div>
                {thread.unread && (
                  <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </Card>

      {/* Message Thread */}
      <Card className="flex flex-col h-full shadow-soft overflow-hidden">
        {/* Thread Header */}
        <div className="p-4 border-b flex items-center justify-between bg-card z-10">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {selectedThread.avatar}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold">{selectedThread.provider}</h2>
              <p className="text-xs text-muted-foreground">{selectedThread.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={
              selectedThread.category === "Clinical" ? "bg-blue-50 text-blue-700 border-blue-200" :
              selectedThread.category === "Billing" ? "bg-green-50 text-green-700 border-green-200" :
              "bg-gray-50 text-gray-700 border-gray-200"
            }>
              {selectedThread.category}
            </Badge>
            <Separator orientation="vertical" className="h-6 mx-2" />
            <Button variant="ghost" size="icon">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4 bg-muted/30">
          <div className="space-y-6">
            {/* Safety Disclaimer */}
            <div className="flex justify-center">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-md text-center">
                <div className="flex items-center justify-center gap-2 text-yellow-800 font-medium text-sm mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Not for Emergencies</span>
                </div>
                <p className="text-xs text-yellow-700">
                  Messages are answered within 2 business days. Call 911 for emergencies.
                </p>
              </div>
            </div>

            {selectedThread.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.isMe ? "flex-row-reverse" : ""}`}
              >
                <Avatar className="h-8 w-8 mt-1">
                  <AvatarFallback className={msg.isMe ? "bg-primary text-primary-foreground" : "bg-muted"}>
                    {msg.avatar}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] space-y-1 ${msg.isMe ? "items-end flex flex-col" : ""}`}>
                  <div className={`p-3 rounded-2xl text-sm ${
                    msg.isMe 
                      ? "bg-primary text-primary-foreground rounded-tr-none" 
                      : "bg-card border shadow-sm rounded-tl-none"
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="p-4 border-t bg-card">
          <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
            <Button type="button" variant="ghost" size="icon" className="shrink-0">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
            </Button>
            <div className="flex-1 relative">
              <Input 
                placeholder="Type your secure message..." 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="pr-10 min-h-[2.5rem]"
              />
            </div>
            <Button type="submit" size="icon" className="shrink-0 bg-primary hover:bg-primary/90">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

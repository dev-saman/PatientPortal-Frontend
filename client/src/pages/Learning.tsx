import { 
  BookOpen, 
  Video, 
  Search, 
  Tag, 
  ChevronRight,
  PlayCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Learning() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Learning Center</h1>
          <p className="text-muted-foreground">Trusted health information and educational resources.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search articles & videos..." className="pl-9 bg-card" />
        </div>
      </div>

      {/* Featured Resource */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-blue-900 to-blue-700 text-white shadow-soft">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative p-8 md:p-12 flex flex-col md:flex-row items-start md:items-center gap-8">
          <div className="flex-1 space-y-4">
            <Badge className="bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 border-none">Featured Collection</Badge>
            <h2 className="text-3xl font-bold">Living with Concussion: A Recovery Guide</h2>
            <p className="text-blue-100 max-w-xl text-lg">
              Understanding the symptoms, management strategies, and the path to recovery after a mild traumatic brain injury.
            </p>
            <Button className="bg-white text-blue-900 hover:bg-blue-50 border-none mt-2">
              Start Guide
            </Button>
          </div>
          <div className="hidden md:flex items-center justify-center bg-white/10 rounded-2xl p-6 backdrop-blur-sm border border-white/20 w-64 aspect-video">
            <PlayCircle className="h-16 w-16 text-white opacity-80" />
          </div>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Resources</TabsTrigger>
          <TabsTrigger value="brain-injury">Brain Injury</TabsTrigger>
          <TabsTrigger value="wellness">Wellness</TabsTrigger>
          <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { 
                type: "Article", 
                icon: BookOpen, 
                title: "Understanding Your Lipid Panel", 
                desc: "What do your cholesterol numbers really mean?", 
                category: "Heart Health",
                readTime: "5 min read"
              },
              { 
                type: "Video", 
                icon: Video, 
                title: "Post-Concussion Syndrome Explained", 
                desc: "Dr. Chen explains common symptoms and treatments.", 
                category: "Neurology",
                readTime: "12 min watch"
              },
              { 
                type: "Article", 
                icon: BookOpen, 
                title: "Sleep Hygiene Basics", 
                desc: "Tips for getting a better night's sleep.", 
                category: "Wellness",
                readTime: "4 min read"
              },
              { 
                type: "Video", 
                icon: Video, 
                title: "Physical Therapy Exercises for Back Pain", 
                desc: "Simple stretches you can do at home.", 
                category: "Physical Therapy",
                readTime: "15 min watch"
              },
              { 
                type: "Article", 
                icon: BookOpen, 
                title: "Managing Stress & Anxiety", 
                desc: "Coping mechanisms for daily stressors.", 
                category: "Mental Health",
                readTime: "7 min read"
              },
              { 
                type: "Article", 
                icon: BookOpen, 
                title: "Nutrition for Brain Health", 
                desc: "Foods that support cognitive function.", 
                category: "Nutrition",
                readTime: "6 min read"
              },
            ].map((item, i) => (
              <Card key={i} className="shadow-soft hover:shadow-soft-hover transition-all group cursor-pointer">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <item.icon className="h-3 w-3" /> {item.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{item.readTime}</span>
                  </div>
                  <CardTitle className="group-hover:text-primary transition-colors">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{item.desc}</p>
                </CardContent>
                <CardFooter className="border-t pt-4 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Tag className="h-3 w-3" />
                    {item.category}
                  </div>
                  <Button variant="ghost" size="sm" className="text-primary p-0 h-auto hover:bg-transparent">
                    Read More <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

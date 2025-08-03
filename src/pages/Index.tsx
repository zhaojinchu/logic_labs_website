import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ProductGrid } from "@/components/ProductGrid";
import { AuthModal } from "@/components/AuthModal";
import { CartModal } from "@/components/CartModal";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Cpu, Zap } from "lucide-react";

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [skillLevelFilter, setSkillLevelFilter] = useState("all");

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchCartItemCount(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchCartItemCount(session.user.id);
      } else {
        setCartItemCount(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchCartItemCount = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('cart_items')
        .select('quantity')
        .eq('user_id', userId);

      if (error) throw error;
      
      const totalItems = data?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      setCartItemCount(totalItems);
    } catch (error) {
      console.error('Error fetching cart count:', error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        cartItemCount={cartItemCount}
        onCartClick={() => setCartModalOpen(true)}
        onLoginClick={() => user ? handleSignOut() : setAuthModalOpen(true)}
        isLoggedIn={!!user}
        userEmail={user?.email}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-electric-blue/10 to-circuit-green/10 py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-bold mb-4">
              Build the Future with 
              <span className="text-electric-blue"> Logic Labs</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
              Electronic kits designed for curious minds. Perfect for students, hobbyists, 
              and anyone ready to explore the world of electronics.
            </p>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <Badge variant="secondary" className="px-4 py-2">
                <GraduationCap className="w-4 h-4 mr-2" />
                Educational
              </Badge>
              <Badge variant="secondary" className="px-4 py-2">
                <Cpu className="w-4 h-4 mr-2" />
                STEM Learning
              </Badge>
              <Badge variant="secondary" className="px-4 py-2">
                <Zap className="w-4 h-4 mr-2" />
                Hands-on Projects
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-4 items-center">
            <h2 className="text-lg font-semibold">Filter Products:</h2>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="microcontroller">Microcontroller</SelectItem>
                <SelectItem value="single_board_computer">Single Board Computer</SelectItem>
                <SelectItem value="robotics">Robotics</SelectItem>
                <SelectItem value="sensors">Sensors</SelectItem>
                <SelectItem value="display">Display</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="iot">IoT</SelectItem>
                <SelectItem value="clock">Clock</SelectItem>
              </SelectContent>
            </Select>

            <Select value={skillLevelFilter} onValueChange={setSkillLevelFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Skill Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>

            {(categoryFilter !== "all" || skillLevelFilter !== "all") && (
              <Button 
                variant="outline" 
                onClick={() => {
                  setCategoryFilter("all");
                  setSkillLevelFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Products */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <ProductGrid 
            categoryFilter={categoryFilter}
            skillLevelFilter={skillLevelFilter}
          />
        </div>
      </section>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
      />
      
      <CartModal
        isOpen={cartModalOpen}
        onClose={() => setCartModalOpen(false)}
      />
    </div>
  );
};

export default Index;

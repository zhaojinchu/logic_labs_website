import { ShoppingCart, User, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface HeaderProps {
  cartItemCount?: number;
  onCartClick?: () => void;
  onLoginClick?: () => void;
  isLoggedIn?: boolean;
  userEmail?: string;
}

export function Header({ 
  cartItemCount = 0, 
  onCartClick, 
  onLoginClick, 
  isLoggedIn = false,
  userEmail 
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-electric-blue rounded-md flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
            </div>
            <h1 className="text-xl font-bold text-foreground">Logic Labs</h1>
          </div>

          {/* Search Bar - Hidden on mobile */}
          <div className="hidden md:flex flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search electronic kits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>

            {/* User Account */}
            <Button variant="ghost" size="icon" onClick={onLoginClick}>
              <User className="h-5 w-5" />
            </Button>
            
            {/* Shopping Cart */}
            <Button variant="ghost" size="icon" className="relative" onClick={onCartClick}>
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <Badge 
                  variant="destructive" 
                  className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                >
                  {cartItemCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="mt-4 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search electronic kits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* User info for logged in users */}
        {isLoggedIn && userEmail && (
          <div className="mt-2 text-sm text-muted-foreground">
            Welcome back, {userEmail}
          </div>
        )}
      </div>
    </header>
  );
}
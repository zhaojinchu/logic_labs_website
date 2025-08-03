import { useState, useEffect } from "react";
import { ProductCard } from "./ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
  category: string;
  skill_level: 'beginner' | 'intermediate' | 'advanced';
  age_group: 'middle_school' | 'high_school' | 'adult';
  in_stock: boolean;
  stock_quantity: number;
}

interface ProductGridProps {
  searchQuery?: string;
  categoryFilter?: string;
  skillLevelFilter?: string;
}

export function ProductGrid({ searchQuery, categoryFilter, skillLevelFilter }: ProductGridProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
  }, [searchQuery, categoryFilter, skillLevelFilter]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      let query = supabase.from('products').select('*');

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }

      if (skillLevelFilter && skillLevelFilter !== 'all') {
        query = query.eq('skill_level', skillLevelFilter);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setProducts((data as Product[]) || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        title: "Error",
        description: "Failed to load products. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (productId: string) => {
    try {
      setAddingToCart(productId);
      
      // Check if user is logged in
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Login Required",
          description: "Please log in to add items to your cart.",
          variant: "destructive"
        });
        return;
      }

      // Check if item already exists in cart
      const { data: existingItem } = await supabase
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .single();

      if (existingItem) {
        // Update quantity
        const { error } = await supabase
          .from('cart_items')
          .update({ quantity: existingItem.quantity + 1 })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        // Add new item
        const { error } = await supabase
          .from('cart_items')
          .insert({
            user_id: user.id,
            product_id: productId,
            quantity: 1
          });

        if (error) throw error;
      }

      toast({
        title: "Added to Cart",
        description: "Item successfully added to your cart!",
      });

    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Error",
        description: "Failed to add item to cart. Please try again.",
        variant: "destructive"
      });
    } finally {
      setAddingToCart(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-electric-blue" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-lg flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-muted-foreground rounded-sm"></div>
        </div>
        <h3 className="text-lg font-semibold mb-2">No Products Found</h3>
        <p className="text-muted-foreground">
          Try adjusting your search or filter criteria.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToCart={handleAddToCart}
          isLoading={addingToCart === product.id}
        />
      ))}
    </div>
  );
}
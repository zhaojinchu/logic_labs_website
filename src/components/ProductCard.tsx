import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Star } from "lucide-react";

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

interface ProductCardProps {
  product: Product;
  onAddToCart: (productId: string) => void;
  isLoading?: boolean;
}

export function ProductCard({ product, onAddToCart, isLoading = false }: ProductCardProps) {
  const skillLevelColors = {
    beginner: "bg-circuit-green text-white",
    intermediate: "bg-resistor-orange text-white", 
    advanced: "bg-destructive text-white"
  };

  const ageGroupLabels = {
    middle_school: "Middle School",
    high_school: "High School",
    adult: "Adult"
  };

  return (
    <Card className="h-full flex flex-col hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-2">
        {/* Product Image Placeholder */}
        <div className="w-full h-48 bg-muted rounded-md mb-3 flex items-center justify-center">
          {product.image_url ? (
            <img 
              src={product.image_url} 
              alt={product.name}
              className="w-full h-full object-cover rounded-md"
            />
          ) : (
            <div className="text-muted-foreground text-center p-4">
              <div className="w-16 h-16 mx-auto mb-2 bg-electric-blue/20 rounded-lg flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-electric-blue rounded-sm"></div>
              </div>
              <p className="text-sm">Product Image</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <Badge className={skillLevelColors[product.skill_level]}>
            {product.skill_level}
          </Badge>
          <Badge variant="outline">
            {ageGroupLabels[product.age_group]}
          </Badge>
        </div>

        <CardTitle className="text-lg leading-tight">
          {product.name}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 pb-2">
        <p className="text-muted-foreground text-sm mb-3 line-clamp-3">
          {product.description}
        </p>

        <div className="text-sm text-muted-foreground">
          Category: <span className="capitalize">{product.category.replace('_', ' ')}</span>
        </div>
      </CardContent>

      <CardFooter className="pt-2">
        <div className="w-full">
          <div className="flex items-center justify-between mb-3">
            <div className="text-2xl font-bold text-electric-blue">
              ${product.price.toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">
              {product.stock_quantity > 0 ? (
                <span className="text-circuit-green">
                  {product.stock_quantity} in stock
                </span>
              ) : (
                <span className="text-destructive">Out of stock</span>
              )}
            </div>
          </div>

          <Button 
            onClick={() => onAddToCart(product.id)}
            disabled={!product.in_stock || product.stock_quantity === 0 || isLoading}
            className="w-full"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {isLoading ? "Adding..." : "Add to Cart"}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
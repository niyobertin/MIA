import { create } from 'zustand';
import { Product } from '@/types';

export interface CartItem {
  product: Product;
  quantity: number;
  sellingPrice: number;
  discountAmount: number;
  taxAmount: number;
}

interface SalesState {
  cart: CartItem[];
  customerId: string | null;
  paymentMethod: 'cash' | 'mobile_money' | 'bank' | 'credit';
  discountAmount: number;
  taxAmount: number;
  notes: string;
  
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartItemQuantity: (productId: string, quantity: number) => void;
  updateCartItemPrice: (productId: string, price: number) => void;
  updateCartItemDiscount: (productId: string, discount: number) => void;
  updateCartItemTax: (productId: string, tax: number) => void;
  clearCart: () => void;
  setCustomer: (customerId: string | null) => void;
  setPaymentMethod: (method: 'cash' | 'mobile_money' | 'bank' | 'credit') => void;
  setGlobalDiscount: (amount: number) => void;
  setGlobalTax: (amount: number) => void;
  setNotes: (notes: string) => void;
  
  getSubtotal: () => number;
  getTotalDiscount: () => number;
  getTotalTax: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  cart: [],
  customerId: null,
  paymentMethod: 'cash',
  discountAmount: 0,
  taxAmount: 0,
  notes: '',

  addToCart: (product, quantity = 1) => {
    set((state) => {
      const existingIndex = state.cart.findIndex(item => item.product.id === product.id);
      if (existingIndex >= 0) {
        const newCart = [...state.cart];
        newCart[existingIndex] = {
          ...newCart[existingIndex],
          quantity: newCart[existingIndex].quantity + quantity,
        };
        return { cart: newCart };
      }
      return {
        cart: [
          ...state.cart,
          {
            product,
            quantity,
            sellingPrice: product.selling_price,
            discountAmount: 0,
            taxAmount: 0,
          },
        ],
      };
    });
  },

  removeFromCart: (productId) => {
    set((state) => ({
      cart: state.cart.filter(item => item.product.id !== productId),
    }));
  },

  updateCartItemQuantity: (productId, quantity) => {
    set((state) => ({
      cart: state.cart.map(item =>
        item.product.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item
      ),
    }));
  },

  updateCartItemPrice: (productId, price) => {
    set((state) => ({
      cart: state.cart.map(item =>
        item.product.id === productId ? { ...item, sellingPrice: price } : item
      ),
    }));
  },

  updateCartItemDiscount: (productId, discount) => {
    set((state) => ({
      cart: state.cart.map(item =>
        item.product.id === productId ? { ...item, discountAmount: discount } : item
      ),
    }));
  },

  updateCartItemTax: (productId, tax) => {
    set((state) => ({
      cart: state.cart.map(item =>
        item.product.id === productId ? { ...item, taxAmount: tax } : item
      ),
    }));
  },

  clearCart: () => set({ cart: [], customerId: null, discountAmount: 0, taxAmount: 0, notes: '' }),

  setCustomer: (customerId) => set({ customerId }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setGlobalDiscount: (discountAmount) => set({ discountAmount }),
  setGlobalTax: (taxAmount) => set({ taxAmount }),
  setNotes: (notes) => set({ notes }),

  getSubtotal: () => {
    const { cart } = get();
    return cart.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0);
  },

  getTotalDiscount: () => {
    const { cart, discountAmount } = get();
    return cart.reduce((sum, item) => sum + item.discountAmount, 0) + discountAmount;
  },

  getTotalTax: () => {
    const { cart, taxAmount } = get();
    return cart.reduce((sum, item) => sum + item.taxAmount, 0) + taxAmount;
  },

  getTotal: () => {
    const { getSubtotal, getTotalDiscount, getTotalTax } = get();
    return getSubtotal() - getTotalDiscount() + getTotalTax();
  },

  getItemCount: () => {
    const { cart } = get();
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          name: string;
          color: string | null;
          category: string;
          notes: string | null;
          owner_id: string;
          client_id: string | null;
          business_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string | null;
          category?: string;
          notes?: string | null;
          owner_id: string;
          client_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string | null;
          category?: string;
          notes?: string | null;
          owner_id?: string;
          client_id?: string | null;
          business_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          status: 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done';
          priority: number;
          due_date: string | null;
          notes: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title: string;
          status?: 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done';
          priority?: number;
          due_date?: string | null;
          notes?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string;
          status?: 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done';
          priority?: number;
          due_date?: string | null;
          notes?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      project_favorites: {
        Row: {
          user_id: string;
          project_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          project_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          project_id?: string;
          created_at?: string;
        };
      };
      project_access: {
        Row: {
          user_id: string;
          project_id: string;
          last_accessed_at: string;
        };
        Insert: {
          user_id: string;
          project_id: string;
          last_accessed_at?: string;
        };
        Update: {
          user_id?: string;
          project_id?: string;
          last_accessed_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          owner_id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
          gender: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          preferences: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          full_name: string;
          phone?: string | null;
          email?: string | null;
          gender?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          preferences?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          gender?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          preferences?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          client_id: string;
          name: string;
          tagline: string | null;
          description: string | null;
          email: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          website: string | null;
          social_links: Json;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          client_id: string;
          name: string;
          tagline?: string | null;
          description?: string | null;
          email?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          website?: string | null;
          social_links?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          client_id?: string;
          name?: string;
          tagline?: string | null;
          description?: string | null;
          email?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          website?: string | null;
          social_links?: Json;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      client_links: {
        Row: {
          id: string;
          client_id: string;
          url: string;
          label: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          url: string;
          label?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          url?: string;
          label?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };
      notes: {
        Row: {
          id: string;
          owner_id: string;
          project_id: string;
          title: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          project_id: string;
          title: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          project_id?: string;
          title?: string;
          content?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      note_links: {
        Row: {
          id: string;
          note_id: string;
          title: string | null;
          url: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_id: string;
          title?: string | null;
          url: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          note_id?: string;
          title?: string | null;
          url?: string;
          created_at?: string;
        };
      };
      business_media: {
        Row: {
          id: string;
          business_id: string;
          store_path: string;
          caption: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          store_path: string;
          caption?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          store_path?: string;
          caption?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };
      ideas: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      idea_connections: {
        Row: {
          id: string;
          owner_id: string;
          from_idea_id: string;
          to_idea_id: string;
          type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          from_idea_id: string;
          to_idea_id: string;
          type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          from_idea_id?: string;
          to_idea_id?: string;
          type?: string;
          created_at?: string;
        };
      };
      idea_project_links: {
        Row: {
          id: string;
          owner_id: string;
          idea_id: string;
          project_id: string;
          role: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          idea_id: string;
          project_id: string;
          role?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          idea_id?: string;
          project_id?: string;
          role?: string | null;
          created_at?: string;
        };
      };
      idea_boards: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          project_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      idea_board_items: {
        Row: {
          id: string;
          owner_id: string;
          board_id: string;
          idea_id: string;
          x: number;
          y: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          board_id: string;
          idea_id: string;
          x?: number;
          y?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          board_id?: string;
          idea_id?: string;
          x?: number;
          y?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      billings: {
        Row: {
          id: string;
          owner_id: string;
          client_id: string | null;
          project_id: string | null;
          title: string;
          client_name: string | null;
          amount: number;
          currency: string;
          status: 'pending' | 'paid' | 'overdue' | 'cancelled';
          due_date: string | null;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          client_id?: string | null;
          project_id?: string | null;
          title: string;
          client_name?: string | null;
          amount: number;
          currency?: string;
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
          due_date?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          client_id?: string | null;
          project_id?: string | null;
          title?: string;
          client_name?: string | null;
          amount?: number;
          currency?: string;
          status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
          due_date?: string | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          phone: string | null;
          timezone: string;
          locale: string;
          avatar_asset_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name: string;
          phone?: string | null;
          timezone?: string;
          locale?: string;
          avatar_asset_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string;
          phone?: string | null;
          timezone?: string;
          locale?: string;
          avatar_asset_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_preferences: {
        Row: {
          user_id: string;
          theme_mode: 'light' | 'dark' | 'system';
          primary_color: string;
          secondary_color: string;
          third_color: string;
          currency: string;
          company_logo_asset_id: string | null;
          cover_image_asset_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          theme_mode?: 'light' | 'dark' | 'system';
          primary_color?: string;
          secondary_color?: string;
          third_color?: string;
          currency?: string;
          company_logo_asset_id?: string | null;
          cover_image_asset_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          theme_mode?: 'light' | 'dark' | 'system';
          primary_color?: string;
          secondary_color?: string;
          third_color?: string;
          currency?: string;
          company_logo_asset_id?: string | null;
          cover_image_asset_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_assets: {
        Row: {
          id: string;
          user_id: string;
          kind: 'avatar' | 'company_logo' | 'cover_image';
          bucket: string;
          path: string;
          mime_type: string;
          size_bytes: number;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: 'avatar' | 'company_logo' | 'cover_image';
          bucket: string;
          path: string;
          mime_type: string;
          size_bytes: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: 'avatar' | 'company_logo' | 'cover_image';
          bucket?: string;
          path?: string;
          mime_type?: string;
          size_bytes?: number;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
      };
      budgets: {
        Row: {
          id: string;
          project_id: string | null;
          name: string;
          description: string | null;
          owner_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          name: string;
          description?: string | null;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string | null;
          name?: string;
          description?: string | null;
          owner_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      budget_categories: {
        Row: {
          id: string;
          budget_id: string;
          name: string;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          budget_id: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          budget_id?: string;
          name?: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };
      budget_items: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          description: string | null;
          quantity: number;
          unit_price: number;
          link: string | null;
          status: 'pending' | 'quoted' | 'acquired';
          is_recurrent: boolean;
          notes: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          name: string;
          description?: string | null;
          quantity?: number;
          unit_price?: number;
          link?: string | null;
          status?: 'pending' | 'quoted' | 'acquired';
          is_recurrent?: boolean;
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          name?: string;
          description?: string | null;
          quantity?: number;
          unit_price?: number;
          link?: string | null;
          status?: 'pending' | 'quoted' | 'acquired';
          is_recurrent?: boolean;
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      todo_lists: {
        Row: {
          id: string;
          owner_id: string;
          project_id: string | null;
          title: string;
          description: string | null;
          color: string | null;
          position: number;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          project_id?: string | null;
          title: string;
          description?: string | null;
          color?: string | null;
          position?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          project_id?: string | null;
          title?: string;
          description?: string | null;
          color?: string | null;
          position?: number;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      todo_items: {
        Row: {
          id: string;
          owner_id: string;
          list_id: string;
          content: string;
          is_done: boolean;
          due_date: string | null;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          list_id: string;
          content: string;
          is_done?: boolean;
          due_date?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          list_id?: string;
          content?: string;
          is_done?: boolean;
          due_date?: string | null;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// Helper types para budgets con totales calculados
export type BudgetItemWithTotal =
  Database['public']['Tables']['budget_items']['Row'] & {
    subtotal: number;
  };

export type BudgetCategoryWithItems =
  Database['public']['Tables']['budget_categories']['Row'] & {
    items: BudgetItemWithTotal[];
    category_total: number;
  };

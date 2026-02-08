export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          name: string
          color: string | null
          category: string
          notes: string | null
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string | null
          category?: string
          notes?: string | null
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string | null
          category?: string
          notes?: string | null
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          project_id: string
          title: string
          status: 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done'
          priority: number
          due_date: string | null
          notes: string | null
          order_index: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          title: string
          status?: 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done'
          priority?: number
          due_date?: string | null
          notes?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          title?: string
          status?: 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done'
          priority?: number
          due_date?: string | null
          notes?: string | null
          order_index?: number
          created_at?: string
          updated_at?: string
        }
      }
      project_favorites: {
        Row: {
          user_id: string
          project_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          project_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          project_id?: string
          created_at?: string
        }
      }
      ideas: {
        Row: {
          id: string
          owner_id: string
          title: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          title: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      idea_connections: {
        Row: {
          id: string
          owner_id: string
          from_idea_id: string
          to_idea_id: string
          type: string
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          from_idea_id: string
          to_idea_id: string
          type: string
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          from_idea_id?: string
          to_idea_id?: string
          type?: string
          created_at?: string
        }
      }
      idea_project_links: {
        Row: {
          id: string
          owner_id: string
          idea_id: string
          project_id: string
          role: string | null
          created_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          idea_id: string
          project_id: string
          role?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          idea_id?: string
          project_id?: string
          role?: string | null
          created_at?: string
        }
      }
      idea_boards: {
        Row: {
          id: string
          owner_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      idea_board_items: {
        Row: {
          id: string
          owner_id: string
          board_id: string
          idea_id: string
          x: number
          y: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          board_id: string
          idea_id: string
          x?: number
          y?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          board_id?: string
          idea_id?: string
          x?: number
          y?: number
          created_at?: string
          updated_at?: string
        }
      }
      budgets: {
        Row: {
          id: string
          project_id: string | null
          name: string
          description: string | null
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id?: string | null
          name: string
          description?: string | null
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string | null
          name?: string
          description?: string | null
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      budget_categories: {
        Row: {
          id: string
          budget_id: string
          name: string
          description: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          budget_id: string
          name: string
          description?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          budget_id?: string
          name?: string
          description?: string | null
          sort_order?: number
          created_at?: string
        }
      }
      budget_items: {
        Row: {
          id: string
          category_id: string
          name: string
          description: string | null
          quantity: number
          unit_price: number
          link: string | null
          status: 'pending' | 'quoted' | 'acquired'
          is_recurrent: boolean
          notes: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          description?: string | null
          quantity?: number
          unit_price?: number
          link?: string | null
          status?: 'pending' | 'quoted' | 'acquired'
          is_recurrent?: boolean
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          description?: string | null
          quantity?: number
          unit_price?: number
          link?: string | null
          status?: 'pending' | 'quoted' | 'acquired'
          is_recurrent?: boolean
          notes?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      todo_lists: {
        Row: {
          id: string
          owner_id: string
          project_id: string | null
          title: string
          description: string | null
          color: string | null
          position: number
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          project_id?: string | null
          title: string
          description?: string | null
          color?: string | null
          position?: number
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          project_id?: string | null
          title?: string
          description?: string | null
          color?: string | null
          position?: number
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      todo_items: {
        Row: {
          id: string
          owner_id: string
          list_id: string
          content: string
          is_done: boolean
          due_date: string | null
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          list_id: string
          content: string
          is_done?: boolean
          due_date?: string | null
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          list_id?: string
          content?: string
          is_done?: boolean
          due_date?: string | null
          position?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

// Helper types para budgets con totales calculados
export type BudgetItemWithTotal = Database['public']['Tables']['budget_items']['Row'] & {
  subtotal: number
}

export type BudgetCategoryWithItems = Database['public']['Tables']['budget_categories']['Row'] & {
  items: BudgetItemWithTotal[]
  category_total: number
}

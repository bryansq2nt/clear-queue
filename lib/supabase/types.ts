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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          color?: string | null
          category?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          color?: string | null
          category?: string
          notes?: string | null
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
    }
  }
}

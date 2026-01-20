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
    }
  }
}

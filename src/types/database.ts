export type MachineStatus = 'active' | 'maintenance' | 'offline' | 'decommissioned'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type LifecycleEntryType = 'maintenance' | 'repair' | 'inspection' | 'note'
export type ProfileStatus = 'pending' | 'active' | 'rejected'
export type ProfileRole = 'user' | 'admin'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          role: ProfileRole
          status: ProfileStatus
          created_at: string
          activated_at: string | null
          activated_by: string | null
        }
        Insert: {
          id: string
          username: string
          role?: ProfileRole
          status?: ProfileStatus
          created_at?: string
          activated_at?: string | null
          activated_by?: string | null
        }
        Update: {
          id?: string
          username?: string
          role?: ProfileRole
          status?: ProfileStatus
          created_at?: string
          activated_at?: string | null
          activated_by?: string | null
        }
        Relationships: []
      }
      machines: {
        Row: {
          id: string
          barcode: string
          name: string
          location: string | null
          warranty_until: string | null
          status: MachineStatus
          external_id: string | null
          external_source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          barcode: string
          name: string
          location?: string | null
          warranty_until?: string | null
          status?: MachineStatus
          external_id?: string | null
          external_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          barcode?: string
          name?: string
          location?: string | null
          warranty_until?: string | null
          status?: MachineStatus
          external_id?: string | null
          external_source?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          id: string
          machine_id: string
          description: string
          status: TicketStatus
          priority: TicketPriority
          created_at: string
          resolved_at: string | null
          created_by: string | null
        }
        Insert: {
          id?: string
          machine_id: string
          description: string
          status?: TicketStatus
          priority?: TicketPriority
          created_at?: string
          resolved_at?: string | null
          created_by?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          description?: string
          status?: TicketStatus
          priority?: TicketPriority
          created_at?: string
          resolved_at?: string | null
          created_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'tickets_machine_id_fkey'
            columns: ['machine_id']
            isOneToOne: false
            referencedRelation: 'machines'
            referencedColumns: ['id']
          },
        ]
      }
      inventory_items: {
        Row: {
          id: string
          barcode: string
          name: string
          category: string | null
          min_stock_level: number
          created_at: string
        }
        Insert: {
          id?: string
          barcode: string
          name: string
          category?: string | null
          min_stock_level?: number
          created_at?: string
        }
        Update: {
          id?: string
          barcode?: string
          name?: string
          category?: string | null
          min_stock_level?: number
          created_at?: string
        }
        Relationships: []
      }
      inventory_batches: {
        Row: {
          id: string
          item_id: string
          batch_number: string
          expiry_date: string | null
          quantity: number
          location: string | null
          received_at: string
        }
        Insert: {
          id?: string
          item_id: string
          batch_number: string
          expiry_date?: string | null
          quantity?: number
          location?: string | null
          received_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          batch_number?: string
          expiry_date?: string | null
          quantity?: number
          location?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inventory_batches_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'inventory_items'
            referencedColumns: ['id']
          },
        ]
      }
      maintenance_tasks: {
        Row: {
          id: string
          machine_id: string
          title: string
          frequency_days: number
          next_due_date: string
          external_id: string | null
          external_source: string | null
          created_at: string
        }
        Insert: {
          id?: string
          machine_id: string
          title: string
          frequency_days: number
          next_due_date: string
          external_id?: string | null
          external_source?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          machine_id?: string
          title?: string
          frequency_days?: number
          next_due_date?: string
          external_id?: string | null
          external_source?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'maintenance_tasks_machine_id_fkey'
            columns: ['machine_id']
            isOneToOne: false
            referencedRelation: 'machines'
            referencedColumns: ['id']
          },
        ]
      }
      maintenance_checklist_items: {
        Row: {
          id: string
          task_id: string
          label: string
          sort_order: number
        }
        Insert: {
          id?: string
          task_id: string
          label: string
          sort_order?: number
        }
        Update: {
          id?: string
          task_id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'maintenance_checklist_items_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'maintenance_tasks'
            referencedColumns: ['id']
          },
        ]
      }
      maintenance_completions: {
        Row: {
          id: string
          task_id: string
          completed_by: string | null
          completed_at: string
          notes: string | null
        }
        Insert: {
          id?: string
          task_id: string
          completed_by?: string | null
          completed_at?: string
          notes?: string | null
        }
        Update: {
          id?: string
          task_id?: string
          completed_by?: string | null
          completed_at?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'maintenance_completions_task_id_fkey'
            columns: ['task_id']
            isOneToOne: false
            referencedRelation: 'maintenance_tasks'
            referencedColumns: ['id']
          },
        ]
      }
      maintenance_completion_items: {
        Row: {
          id: string
          completion_id: string
          label: string
          checked: boolean
        }
        Insert: {
          id?: string
          completion_id: string
          label: string
          checked?: boolean
        }
        Update: {
          id?: string
          completion_id?: string
          label?: string
          checked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'maintenance_completion_items_completion_id_fkey'
            columns: ['completion_id']
            isOneToOne: false
            referencedRelation: 'maintenance_completions'
            referencedColumns: ['id']
          },
        ]
      }
      import_runs: {
        Row: {
          id: string
          source: string
          filename: string | null
          rows_total: number
          rows_imported: number
          rows_skipped: number
          errors: unknown
          created_at: string
        }
        Insert: {
          id?: string
          source?: string
          filename?: string | null
          rows_total?: number
          rows_imported?: number
          rows_skipped?: number
          errors?: unknown
          created_at?: string
        }
        Update: {
          id?: string
          source?: string
          filename?: string | null
          rows_total?: number
          rows_imported?: number
          rows_skipped?: number
          errors?: unknown
          created_at?: string
        }
        Relationships: []
      }
      machine_lifecycle_entries: {
        Row: {
          id: string
          machine_id: string
          entry_type: LifecycleEntryType
          title: string
          description: string | null
          occurred_at: string
          created_at: string
          created_by: string | null
          duration_days: number | null
          next_due_date: string | null
        }
        Insert: {
          id?: string
          machine_id: string
          entry_type: LifecycleEntryType
          title: string
          description?: string | null
          occurred_at?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          next_due_date?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          entry_type?: LifecycleEntryType
          title?: string
          description?: string | null
          occurred_at?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number | null
          next_due_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'machine_lifecycle_entries_machine_id_fkey'
            columns: ['machine_id']
            isOneToOne: false
            referencedRelation: 'machines'
            referencedColumns: ['id']
          },
        ]
      }
      machine_lifecycle_photos: {
        Row: {
          id: string
          entry_id: string
          machine_id: string
          storage_path: string
          filename: string
          mime_type: string
          file_size_bytes: number | null
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          machine_id: string
          storage_path: string
          filename: string
          mime_type: string
          file_size_bytes?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          entry_id?: string
          machine_id?: string
          storage_path?: string
          filename?: string
          mime_type?: string
          file_size_bytes?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'machine_lifecycle_photos_entry_id_fkey'
            columns: ['entry_id']
            isOneToOne: false
            referencedRelation: 'machine_lifecycle_entries'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'machine_lifecycle_photos_machine_id_fkey'
            columns: ['machine_id']
            isOneToOne: false
            referencedRelation: 'machines'
            referencedColumns: ['id']
          },
        ]
      }
      machine_attachments: {
        Row: {
          id: string
          machine_id: string
          storage_path: string
          filename: string
          mime_type: string
          file_size_bytes: number | null
          title: string | null
          analysis_summary: string | null
          analysis_metadata: Record<string, unknown>
          analyzed_at: string | null
          ai_analysis_status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          machine_id: string
          storage_path: string
          filename: string
          mime_type?: string
          file_size_bytes?: number | null
          title?: string | null
          analysis_summary?: string | null
          analysis_metadata?: Record<string, unknown>
          analyzed_at?: string | null
          ai_analysis_status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          machine_id?: string
          storage_path?: string
          filename?: string
          mime_type?: string
          file_size_bytes?: number | null
          title?: string | null
          analysis_summary?: string | null
          analysis_metadata?: Record<string, unknown>
          analyzed_at?: string | null
          ai_analysis_status?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'machine_attachments_machine_id_fkey'
            columns: ['machine_id']
            isOneToOne: false
            referencedRelation: 'machines'
            referencedColumns: ['id']
          },
        ]
      }
      maintenance_plan_drafts: {
        Row: {
          id: string
          machine_id: string
          attachment_id: string | null
          title: string
          frequency_days: number | null
          status: string
          source: string
          ai_model: string | null
          error_message: string | null
          created_at: string
          activated_at: string | null
        }
        Insert: {
          id?: string
          machine_id: string
          attachment_id?: string | null
          title: string
          frequency_days?: number | null
          status?: string
          source?: string
          ai_model?: string | null
          error_message?: string | null
          created_at?: string
          activated_at?: string | null
        }
        Update: {
          id?: string
          machine_id?: string
          attachment_id?: string | null
          title?: string
          frequency_days?: number | null
          status?: string
          source?: string
          ai_model?: string | null
          error_message?: string | null
          created_at?: string
          activated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'maintenance_plan_drafts_machine_id_fkey'
            columns: ['machine_id']
            isOneToOne: false
            referencedRelation: 'machines'
            referencedColumns: ['id']
          },
        ]
      }
      maintenance_draft_checklist_items: {
        Row: {
          id: string
          draft_id: string
          label: string
          sort_order: number
        }
        Insert: {
          id?: string
          draft_id: string
          label: string
          sort_order?: number
        }
        Update: {
          id?: string
          draft_id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'maintenance_draft_checklist_items_draft_id_fkey'
            columns: ['draft_id']
            isOneToOne: false
            referencedRelation: 'maintenance_plan_drafts'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      set_profile_status: {
        Args: { target_id: string; new_status: string }
        Returns: {
          id: string
          username: string
          role: ProfileRole
          status: ProfileStatus
          created_at: string
          activated_at: string | null
          activated_by: string | null
        }
      }
      set_profile_role: {
        Args: { target_id: string; new_role: string }
        Returns: {
          id: string
          username: string
          role: ProfileRole
          status: ProfileStatus
          created_at: string
          activated_at: string | null
          activated_by: string | null
        }
      }
      is_active_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      machine_status: MachineStatus
      ticket_status: TicketStatus
      ticket_priority: TicketPriority
      lifecycle_entry_type: LifecycleEntryType
    }
    CompositeTypes: Record<string, never>
  }
}

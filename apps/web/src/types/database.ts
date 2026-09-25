export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_events: {
        Row: {
          account_id: string
          created_at: string
          event_data: Json
          event_type: string
          id: string
          performed_by: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          performed_by?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          active_company_id: string | null
          address: string | null
          admin_notes: string | null
          billing_cycle: string | null
          created_at: string
          current_period_end: string | null
          email: string
          id: string
          is_developer: boolean
          max_databases: number
          owner_full_name: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          phone: string | null
          plan: string
          subscription_status: string
          suspended_by_admin: boolean
          trial_ends_at: string
          updated_at: string
        }
        Insert: {
          active_company_id?: string | null
          address?: string | null
          admin_notes?: string | null
          billing_cycle?: string | null
          created_at?: string
          current_period_end?: string | null
          email: string
          id: string
          is_developer?: boolean
          max_databases?: number
          owner_full_name: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          phone?: string | null
          plan?: string
          subscription_status?: string
          suspended_by_admin?: boolean
          trial_ends_at?: string
          updated_at?: string
        }
        Update: {
          active_company_id?: string | null
          address?: string | null
          admin_notes?: string | null
          billing_cycle?: string | null
          created_at?: string
          current_period_end?: string | null
          email?: string
          id?: string
          is_developer?: boolean
          max_databases?: number
          owner_full_name?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          phone?: string | null
          plan?: string
          subscription_status?: string
          suspended_by_admin?: boolean
          trial_ends_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_active_company_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      activity_log: {
        Row: {
          company_id: string
          event_label: string
          event_time: string
          event_type: string
          id: string
          machine_id: string | null
          metadata: Json
          work_session_id: string | null
          worker_id: string | null
        }
        Insert: {
          company_id: string
          event_label: string
          event_time?: string
          event_type: string
          id?: string
          machine_id?: string | null
          metadata?: Json
          work_session_id?: string | null
          worker_id?: string | null
        }
        Update: {
          company_id?: string
          event_label?: string
          event_time?: string
          event_type?: string
          id?: string
          machine_id?: string | null
          metadata?: Json
          work_session_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "activity_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "activity_log_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "activity_log_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "v_shift_session_detail"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "activity_log_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "activity_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "activity_log_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          code: string | null
          company_id: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          odoo_id: number | null
          phone: string | null
          portal_auth_user_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          company_id: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          odoo_id?: number | null
          phone?: string | null
          portal_auth_user_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          company_id?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          odoo_id?: number | null
          phone?: string | null
          portal_auth_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      code_sequences: {
        Row: {
          company_id: string
          entity_type: string
          last_number: number
          year: number
        }
        Insert: {
          company_id: string
          entity_type: string
          last_number?: number
          year: number
        }
        Update: {
          company_id?: string
          entity_type?: string
          last_number?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "code_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      companies: {
        Row: {
          account_id: string | null
          created_at: string
          currency: string
          id: string
          industry: string | null
          is_active: boolean
          is_developer_account: boolean
          logo_url: string | null
          name: string
          operation_mode: string
          subscription_plan: string
          timezone: string
          trial_ends_at: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          industry?: string | null
          is_active?: boolean
          is_developer_account?: boolean
          logo_url?: string | null
          name: string
          operation_mode?: string
          subscription_plan?: string
          timezone?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          industry?: string | null
          is_active?: boolean
          is_developer_account?: boolean
          logo_url?: string | null
          name?: string
          operation_mode?: string
          subscription_plan?: string
          timezone?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_interactions: {
        Row: {
          author_staff_id: string | null
          company_id: string
          created_at: string
          happened_at: string
          id: string
          prospect_id: string
          summary: string
          type: string
        }
        Insert: {
          author_staff_id?: string | null
          company_id: string
          created_at?: string
          happened_at?: string
          id?: string
          prospect_id: string
          summary: string
          type: string
        }
        Update: {
          author_staff_id?: string | null
          company_id?: string
          created_at?: string
          happened_at?: string
          id?: string
          prospect_id?: string
          summary?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_interactions_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_interactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "crm_interactions_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_prospects: {
        Row: {
          company_id: string
          company_name: string | null
          contact_person: string | null
          converted_at: string | null
          converted_client_id: string | null
          created_at: string
          email: string | null
          estimated_value: number | null
          expected_close_at: string | null
          full_name: string
          id: string
          notes: string | null
          owner_staff_id: string | null
          phone: string | null
          priority: string
          probability: number | null
          requested_date: string | null
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          company_id: string
          company_name?: string | null
          contact_person?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          expected_close_at?: string | null
          full_name: string
          id?: string
          notes?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          priority?: string
          probability?: number | null
          requested_date?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          company_name?: string | null
          contact_person?: string | null
          converted_at?: string | null
          converted_client_id?: string | null
          created_at?: string
          email?: string | null
          estimated_value?: number | null
          expected_close_at?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          priority?: string
          probability?: number | null
          requested_date?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "crm_prospects_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_prospects_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      databases: {
        Row: {
          account_id: string
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "databases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "databases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "databases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      devices: {
        Row: {
          auth_user_id: string | null
          company_id: string
          default_machine_id: string | null
          device_mode: string
          device_name: string
          id: string
          is_active: boolean
          last_seen_at: string | null
          registered_at: string
        }
        Insert: {
          auth_user_id?: string | null
          company_id: string
          default_machine_id?: string | null
          device_mode: string
          device_name: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          registered_at?: string
        }
        Update: {
          auth_user_id?: string | null
          company_id?: string
          default_machine_id?: string | null
          device_mode?: string
          device_name?: string
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          registered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "fk_devices_default_machine"
            columns: ["default_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_default_machine"
            columns: ["default_machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          location: string | null
          name: string
          quantity_on_hand: number
          reorder_threshold: number
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          quantity_on_hand?: number
          reorder_threshold?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          quantity_on_hand?: number
          reorder_threshold?: number
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          manufacturing_order_id: string | null
          quantity: number
          reference: string | null
          transaction_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          manufacturing_order_id?: string | null
          quantity: number
          reference?: string | null
          transaction_type: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          manufacturing_order_id?: string | null
          quantity?: number
          reference?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "inventory_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_inventory_low_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_manufacturing_order_id_fkey"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          company_id: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          sequence_order: number
          unit_price: number
        }
        Insert: {
          company_id: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          sequence_order?: number
          unit_price?: number
        }
        Update: {
          company_id?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          sequence_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issued_date: string | null
          notes: string | null
          odoo_id: number | null
          project_id: string | null
          quote_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_date?: string | null
          notes?: string | null
          odoo_id?: number | null
          project_id?: string | null
          quote_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_date?: string | null
          notes?: string | null
          odoo_id?: number | null
          project_id?: string | null
          quote_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_maintenance_log: {
        Row: {
          company_id: string
          created_at: string
          created_by_staff_id: string | null
          description: string
          id: string
          machine_id: string
          maintenance_date: string
          next_due_date: string | null
          performed_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by_staff_id?: string | null
          description: string
          id?: string
          machine_id: string
          maintenance_date: string
          next_due_date?: string | null
          performed_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by_staff_id?: string | null
          description?: string
          id?: string
          machine_id?: string
          maintenance_date?: string
          next_due_date?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "machine_maintenance_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_maintenance_log_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
        ]
      }
      machine_tools: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_occupied: boolean
          machine_id: string
          tool_diameter: number | null
          tool_length: number | null
          tool_name: string
          tool_number: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_occupied?: boolean
          machine_id: string
          tool_diameter?: number | null
          tool_length?: number | null
          tool_name?: string
          tool_number: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_occupied?: boolean
          machine_id?: string
          tool_diameter?: number | null
          tool_length?: number | null
          tool_name?: string
          tool_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_tools_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_tools_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "machine_tools_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_tools_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
        ]
      }
      machines: {
        Row: {
          code: string
          company_id: string
          created_at: string
          current_status: string
          id: string
          interface_type: string
          is_active: boolean
          location: string | null
          machine_type: string | null
          name: string
          tool_count: number
          tools_count: number | null
          updated_at: string
        }
        Insert: {
          code: string
          company_id: string
          created_at?: string
          current_status?: string
          id?: string
          interface_type?: string
          is_active?: boolean
          location?: string | null
          machine_type?: string | null
          name: string
          tool_count?: number
          tools_count?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string
          created_at?: string
          current_status?: string
          id?: string
          interface_type?: string
          is_active?: boolean
          location?: string | null
          machine_type?: string | null
          name?: string
          tool_count?: number
          tools_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      manufacturing_orders: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_number: string
          piece_task_id: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          prepared_at: string | null
          product_name: string
          project_id: string
          quantity: number
          quote_id: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number: string
          piece_task_id?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          prepared_at?: string | null
          product_name: string
          project_id: string
          quantity?: number
          quote_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          piece_task_id?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          prepared_at?: string | null
          product_name?: string
          project_id?: string
          quantity?: number
          quote_id?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manufacturing_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manufacturing_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "manufacturing_orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      nomenclature_cells: {
        Row: {
          column_id: string
          company_id: string
          id: string
          nomenclature_id: string
          row_id: string
          value_text: string | null
        }
        Insert: {
          column_id: string
          company_id: string
          id?: string
          nomenclature_id: string
          row_id: string
          value_text?: string | null
        }
        Update: {
          column_id?: string
          company_id?: string
          id?: string
          nomenclature_id?: string
          row_id?: string
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nomenclature_cells_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "nomenclature_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_cells_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_cells_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "nomenclature_cells_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_cells_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "nomenclature_cells_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "nomenclature_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      nomenclature_columns: {
        Row: {
          column_type: string
          company_id: string
          hourly_rate: number | null
          id: string
          is_total_column: boolean
          name: string
          nomenclature_id: string
          sequence_order: number
          stage: string | null
        }
        Insert: {
          column_type?: string
          company_id: string
          hourly_rate?: number | null
          id?: string
          is_total_column?: boolean
          name: string
          nomenclature_id: string
          sequence_order?: number
          stage?: string | null
        }
        Update: {
          column_type?: string
          company_id?: string
          hourly_rate?: number | null
          id?: string
          is_total_column?: boolean
          name?: string
          nomenclature_id?: string
          sequence_order?: number
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nomenclature_columns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_columns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "nomenclature_columns_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_columns_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
        ]
      }
      nomenclature_rows: {
        Row: {
          company_id: string
          id: string
          nomenclature_id: string
          piece_task_id: string | null
          row_label: string | null
          sequence_order: number
        }
        Insert: {
          company_id: string
          id?: string
          nomenclature_id: string
          piece_task_id?: string | null
          row_label?: string | null
          sequence_order?: number
        }
        Update: {
          company_id?: string
          id?: string
          nomenclature_id?: string
          piece_task_id?: string | null
          row_label?: string | null
          sequence_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "nomenclature_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_rows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "nomenclature_rows_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_rows_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "nomenclature_rows_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclature_rows_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "nomenclature_rows_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "nomenclature_rows_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
        ]
      }
      nomenclatures: {
        Row: {
          actual_cost_updated_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          project_id: string | null
          status: string
          total_actual_cost: number | null
          total_estimated_cost: number | null
          updated_at: string
          validated_at: string | null
          validated_by: string | null
          validated_by_staff_id: string | null
        }
        Insert: {
          actual_cost_updated_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          project_id?: string | null
          status?: string
          total_actual_cost?: number | null
          total_estimated_cost?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_by_staff_id?: string | null
        }
        Update: {
          actual_cost_updated_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id?: string | null
          status?: string
          total_actual_cost?: number | null
          total_estimated_cost?: number | null
          updated_at?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_by_staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nomenclatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "nomenclatures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclatures_validated_by_staff_id_fkey"
            columns: ["validated_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      odoo_config: {
        Row: {
          api_key_encrypted: string
          auto_sync_enabled: boolean
          auto_sync_interval_minutes: number
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          last_test_at: string | null
          last_test_error: string | null
          last_test_status: string | null
          notify_on_error: boolean
          odoo_db: string
          odoo_url: string
          odoo_username: string
          records_synced: number
          sync_direction: string
          sync_modules: Json
          updated_at: string
          version: string | null
        }
        Insert: {
          api_key_encrypted: string
          auto_sync_enabled?: boolean
          auto_sync_interval_minutes?: number
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          notify_on_error?: boolean
          odoo_db: string
          odoo_url: string
          odoo_username: string
          records_synced?: number
          sync_direction?: string
          sync_modules?: Json
          updated_at?: string
          version?: string | null
        }
        Update: {
          api_key_encrypted?: string
          auto_sync_enabled?: boolean
          auto_sync_interval_minutes?: number
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_status?: string | null
          notify_on_error?: boolean
          odoo_db?: string
          odoo_url?: string
          odoo_username?: string
          records_synced?: number
          sync_direction?: string
          sync_modules?: Json
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "odoo_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odoo_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      odoo_sync_log: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          details: Json | null
          direction: string
          error_message: string | null
          id: string
          records_synced: number
          started_at: string
          status: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          direction: string
          error_message?: string | null
          id?: string
          records_synced?: number
          started_at?: string
          status: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          direction?: string
          error_message?: string | null
          id?: string
          records_synced?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "odoo_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odoo_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      piece_costing_materials: {
        Row: {
          company_id: string
          created_at: string
          id: string
          material_code: string | null
          material_name: string
          nomenclature_id: string
          notes: string | null
          piece_task_id: string | null
          quantity: number
          sequence_order: number
          subtotal: number | null
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          material_code?: string | null
          material_name: string
          nomenclature_id: string
          notes?: string | null
          piece_task_id?: string | null
          quantity?: number
          sequence_order?: number
          subtotal?: number | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          material_code?: string | null
          material_name?: string
          nomenclature_id?: string
          notes?: string | null
          piece_task_id?: string | null
          quantity?: number
          sequence_order?: number
          subtotal?: number | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_costing_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "piece_costing_materials_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_materials_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "piece_costing_materials_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_materials_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_costing_materials_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_costing_materials_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
        ]
      }
      piece_costing_operations: {
        Row: {
          company_id: string
          created_at: string
          estimated_hours: number
          hourly_rate: number
          id: string
          label: string | null
          machine_id: string | null
          nomenclature_id: string
          notes: string | null
          piece_task_id: string | null
          sequence_order: number
          stage: string
          subtotal: number | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          estimated_hours?: number
          hourly_rate?: number
          id?: string
          label?: string | null
          machine_id?: string | null
          nomenclature_id: string
          notes?: string | null
          piece_task_id?: string | null
          sequence_order?: number
          stage: string
          subtotal?: number | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          estimated_hours?: number
          hourly_rate?: number
          id?: string
          label?: string | null
          machine_id?: string | null
          nomenclature_id?: string
          notes?: string | null
          piece_task_id?: string | null
          sequence_order?: number
          stage?: string
          subtotal?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_costing_operations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_operations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "piece_costing_operations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_operations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "piece_costing_operations_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_operations_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "piece_costing_operations_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_costing_operations_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_costing_operations_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_costing_operations_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
        ]
      }
      piece_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          doc_type: string
          id: string
          notes: string | null
          piece_task_id: string
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          doc_type: string
          id?: string
          notes?: string | null
          piece_task_id: string
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          doc_type?: string
          id?: string
          notes?: string | null
          piece_task_id?: string
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "piece_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "piece_documents_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_documents_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_documents_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_documents_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
        ]
      }
      piece_handoffs: {
        Row: {
          company_id: string
          created_at: string
          from_worker_id: string | null
          id: string
          is_read: boolean
          message: string
          piece_task_id: string
          project_id: string | null
          read_at: string | null
          shift_id: string | null
          to_worker_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          from_worker_id?: string | null
          id?: string
          is_read?: boolean
          message: string
          piece_task_id: string
          project_id?: string | null
          read_at?: string | null
          shift_id?: string | null
          to_worker_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          from_worker_id?: string | null
          id?: string
          is_read?: boolean
          message?: string
          piece_task_id?: string
          project_id?: string | null
          read_at?: string | null
          shift_id?: string | null
          to_worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "piece_handoffs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_handoffs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "piece_handoffs_from_worker_id_fkey"
            columns: ["from_worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "piece_handoffs_from_worker_id_fkey"
            columns: ["from_worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "piece_handoffs_from_worker_id_fkey"
            columns: ["from_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_handoffs_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_handoffs_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_handoffs_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_handoffs_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "piece_handoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_handoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "piece_handoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "piece_handoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "piece_handoffs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "piece_handoffs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "piece_handoffs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_shift_report"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "piece_handoffs_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piece_handoffs_to_worker_id_fkey"
            columns: ["to_worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "piece_handoffs_to_worker_id_fkey"
            columns: ["to_worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "piece_handoffs_to_worker_id_fkey"
            columns: ["to_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      pieces_tasks: {
        Row: {
          cnc_estimated_cost: number | null
          cnc_estimated_hours: number | null
          code: string | null
          company_id: string
          costing_status: string
          created_at: string
          drawing_url: string | null
          estimated_minutes: number | null
          estimated_time_minutes: number | null
          id: string
          manufacturing_order_id: string | null
          material: string | null
          name: string
          nomenclature_id: string | null
          phase: string | null
          primary_operation_type: string | null
          production_status: string
          project_id: string
          quantity: number
          scheduled_at: string | null
          sent_to_production_at: string | null
          sequence_order: number
          status: string
          technical_notes: string | null
          technical_status: string
          technical_validated_at: string | null
          updated_at: string
        }
        Insert: {
          cnc_estimated_cost?: number | null
          cnc_estimated_hours?: number | null
          code?: string | null
          company_id: string
          costing_status?: string
          created_at?: string
          drawing_url?: string | null
          estimated_minutes?: number | null
          estimated_time_minutes?: number | null
          id?: string
          manufacturing_order_id?: string | null
          material?: string | null
          name: string
          nomenclature_id?: string | null
          phase?: string | null
          primary_operation_type?: string | null
          production_status?: string
          project_id: string
          quantity?: number
          scheduled_at?: string | null
          sent_to_production_at?: string | null
          sequence_order?: number
          status?: string
          technical_notes?: string | null
          technical_status?: string
          technical_validated_at?: string | null
          updated_at?: string
        }
        Update: {
          cnc_estimated_cost?: number | null
          cnc_estimated_hours?: number | null
          code?: string | null
          company_id?: string
          costing_status?: string
          created_at?: string
          drawing_url?: string | null
          estimated_minutes?: number | null
          estimated_time_minutes?: number | null
          id?: string
          manufacturing_order_id?: string | null
          material?: string | null
          name?: string
          nomenclature_id?: string | null
          phase?: string | null
          primary_operation_type?: string | null
          production_status?: string
          project_id?: string
          quantity?: number
          scheduled_at?: string | null
          sent_to_production_at?: string | null
          sequence_order?: number
          status?: string
          technical_notes?: string | null
          technical_status?: string
          technical_validated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pieces_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "pieces_tasks_manufacturing_order_id_fkey"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
        ]
      }
      planning: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          machine_id: string | null
          manufacturing_order_id: string | null
          notes: string | null
          piece_task_id: string | null
          planned_date: string
          project_id: string | null
          shift_end: string | null
          shift_number: string | null
          shift_start: string | null
          started_at: string | null
          status: string
          updated_at: string
          worker_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          machine_id?: string | null
          manufacturing_order_id?: string | null
          notes?: string | null
          piece_task_id?: string | null
          planned_date: string
          project_id?: string | null
          shift_end?: string | null
          shift_number?: string | null
          shift_start?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          machine_id?: string | null
          manufacturing_order_id?: string | null
          notes?: string | null
          piece_task_id?: string | null
          planned_date?: string
          project_id?: string | null
          shift_end?: string | null
          shift_number?: string | null
          shift_start?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "planning_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "planning_manufacturing_order_id_fkey"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "planning_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "planning_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "planning_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "planning_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "planning_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "planning_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_qr_codes: {
        Row: {
          company_id: string
          generated_at: string
          qr_secret: string
          regenerate_count: number
        }
        Insert: {
          company_id: string
          generated_at?: string
          qr_secret: string
          regenerate_count?: number
        }
        Update: {
          company_id?: string
          generated_at?: string
          qr_secret?: string
          regenerate_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "planning_qr_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_qr_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          admin_notes: string | null
          currency: string
          id: string
          premium_max_databases: number
          premium_max_staff: number
          premium_monthly_price: number
          premium_yearly_price: number
          standard_max_databases: number
          standard_max_staff: number
          standard_monthly_price: number
          standard_yearly_price: number
          trial_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          admin_notes?: string | null
          currency?: string
          id?: string
          premium_max_databases?: number
          premium_max_staff?: number
          premium_monthly_price?: number
          premium_yearly_price?: number
          standard_max_databases?: number
          standard_max_staff?: number
          standard_monthly_price?: number
          standard_yearly_price?: number
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          admin_notes?: string | null
          currency?: string
          id?: string
          premium_max_databases?: number
          premium_max_staff?: number
          premium_monthly_price?: number
          premium_yearly_price?: number
          standard_max_databases?: number
          standard_max_staff?: number
          standard_monthly_price?: number
          standard_yearly_price?: number
          trial_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived_at: string | null
          client_id: string | null
          code: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_cost: number | null
          estimated_hours: number | null
          id: string
          is_archived: boolean
          name: string
          nomenclature_id: string | null
          odoo_id: number | null
          opportunity_id: string | null
          quoted_price: number | null
          sent_to_production_at: string | null
          start_date: string | null
          status: string
          study_completed_at: string | null
          study_notes: string | null
          study_started_at: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          code?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_cost?: number | null
          estimated_hours?: number | null
          id?: string
          is_archived?: boolean
          name: string
          nomenclature_id?: string | null
          odoo_id?: number | null
          opportunity_id?: string | null
          quoted_price?: number | null
          sent_to_production_at?: string | null
          start_date?: string | null
          status?: string
          study_completed_at?: string | null
          study_notes?: string | null
          study_started_at?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          code?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_cost?: number | null
          estimated_hours?: number | null
          id?: string
          is_archived?: boolean
          name?: string
          nomenclature_id?: string | null
          odoo_id?: number | null
          opportunity_id?: string | null
          quoted_price?: number | null
          sent_to_production_at?: string | null
          start_date?: string | null
          status?: string
          study_completed_at?: string | null
          study_notes?: string | null
          study_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "projects_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "projects_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          company_id: string
          description: string
          id: string
          quantity: number
          quote_id: string
          sequence_order: number
          unit_price: number
        }
        Insert: {
          company_id: string
          description: string
          id?: string
          quantity?: number
          quote_id: string
          sequence_order?: number
          unit_price?: number
        }
        Update: {
          company_id?: string
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          sequence_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          nomenclature_id: string | null
          notes: string | null
          project_id: string | null
          prospect_id: string | null
          quote_number: string
          status: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          nomenclature_id?: string | null
          notes?: string | null
          project_id?: string | null
          prospect_id?: string | null
          quote_number: string
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          nomenclature_id?: string | null
          notes?: string | null
          project_id?: string | null
          prospect_id?: string | null
          quote_number?: string
          status?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "nomenclatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_nomenclature_id_fkey"
            columns: ["nomenclature_id"]
            isOneToOne: false
            referencedRelation: "v_piece_costing_summary"
            referencedColumns: ["nomenclature_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "quotes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "crm_prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          id: string
          is_system: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      shift_piece_work: {
        Row: {
          company_id: string
          created_at: string
          ended_at: string | null
          id: string
          piece_task_id: string
          project_id: string | null
          shift_id: string
          started_at: string
          worker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          piece_task_id: string
          project_id?: string | null
          shift_id: string
          started_at?: string
          worker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          piece_task_id?: string
          project_id?: string | null
          shift_id?: string
          started_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_piece_work_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "shift_piece_work_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_shift_report"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "shift_piece_work_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "shift_piece_work_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "shift_piece_work_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_users: {
        Row: {
          account_id: string | null
          auth_user_id: string
          avatar_url: string | null
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_owner: boolean
          phone: string | null
          role_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          auth_user_id: string
          avatar_url?: string | null
          company_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          is_owner?: boolean
          phone?: string | null
          role_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          auth_user_id?: string
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_owner?: boolean
          phone?: string | null
          role_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "staff_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      stop_reasons: {
        Row: {
          color: string
          company_id: string
          created_at: string
          icon: string | null
          id: string
          interface_type: string
          is_active: boolean
          name: string
          requires_note: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          icon?: string | null
          id?: string
          interface_type?: string
          is_active?: boolean
          name: string
          requires_note?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          icon?: string | null
          id?: string
          interface_type?: string
          is_active?: boolean
          name?: string
          requires_note?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stop_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stop_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      supplier_invoice_items: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          total_ht: number
          unit_price_ht: number
        }
        Insert: {
          company_id: string
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          total_ht?: number
          unit_price_ht?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          total_ht?: number
          unit_price_ht?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          amount_ht: number
          amount_ttc: number
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          payment_date: string | null
          reference: string | null
          status: string
          supplier_email: string | null
          supplier_name: string
          supplier_phone: string | null
          updated_at: string
          vat_rate: number
        }
        Insert: {
          amount_ht?: number
          amount_ttc?: number
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          payment_date?: string | null
          reference?: string | null
          status?: string
          supplier_email?: string | null
          supplier_name: string
          supplier_phone?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          amount_ht?: number
          amount_ttc?: number
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          payment_date?: string | null
          reference?: string | null
          status?: string
          supplier_email?: string | null
          supplier_name?: string
          supplier_phone?: string | null
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "supplier_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_types: {
        Row: {
          color: string
          company_id: string
          created_at: string
          icon: string | null
          id: string
          interface_type: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          icon?: string | null
          id?: string
          interface_type?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          icon?: string | null
          id?: string
          interface_type?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      work_session_corrections: {
        Row: {
          action: string
          company_id: string
          corrected_by_staff_id: string | null
          corrected_by_type: string
          corrected_by_worker_id: string | null
          created_at: string
          id: string
          new_duration_seconds: number | null
          new_ended_at: string | null
          new_started_at: string | null
          old_duration_seconds: number | null
          old_ended_at: string | null
          old_started_at: string | null
          reason: string | null
          work_session_id: string
        }
        Insert: {
          action: string
          company_id: string
          corrected_by_staff_id?: string | null
          corrected_by_type: string
          corrected_by_worker_id?: string | null
          created_at?: string
          id?: string
          new_duration_seconds?: number | null
          new_ended_at?: string | null
          new_started_at?: string | null
          old_duration_seconds?: number | null
          old_ended_at?: string | null
          old_started_at?: string | null
          reason?: string | null
          work_session_id: string
        }
        Update: {
          action?: string
          company_id?: string
          corrected_by_staff_id?: string | null
          corrected_by_type?: string
          corrected_by_worker_id?: string | null
          created_at?: string
          id?: string
          new_duration_seconds?: number | null
          new_ended_at?: string | null
          new_started_at?: string | null
          old_duration_seconds?: number | null
          old_ended_at?: string | null
          old_started_at?: string | null
          reason?: string | null
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_session_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "work_session_corrections_corrected_by_staff_id_fkey"
            columns: ["corrected_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_corrections_corrected_by_worker_id_fkey"
            columns: ["corrected_by_worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_session_corrections_corrected_by_worker_id_fkey"
            columns: ["corrected_by_worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_session_corrections_corrected_by_worker_id_fkey"
            columns: ["corrected_by_worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_session_corrections_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "work_session_corrections_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "v_shift_session_detail"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "work_session_corrections_work_session_id_fkey"
            columns: ["work_session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sessions: {
        Row: {
          company_id: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          machine_id: string | null
          note: string | null
          piece_task_id: string | null
          planning_id: string | null
          project_id: string | null
          session_type: string
          shift_id: string | null
          source: string
          started_at: string
          stop_reason_id: string | null
          task_type_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by_staff_id: string | null
          worker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          machine_id?: string | null
          note?: string | null
          piece_task_id?: string | null
          planning_id?: string | null
          project_id?: string | null
          session_type: string
          shift_id?: string | null
          source?: string
          started_at?: string
          stop_reason_id?: string | null
          task_type_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_staff_id?: string | null
          worker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          machine_id?: string | null
          note?: string | null
          piece_task_id?: string | null
          planning_id?: string | null
          project_id?: string | null
          session_type?: string
          shift_id?: string | null
          source?: string
          started_at?: string
          stop_reason_id?: string | null
          task_type_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_staff_id?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "work_sessions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "work_sessions_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "work_sessions_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "work_sessions_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "work_sessions_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "planning"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["planning_id"]
          },
          {
            foreignKeyName: "work_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "work_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "work_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_shift_report"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "work_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_stop_reason_id_fkey"
            columns: ["stop_reason_id"]
            isOneToOne: false
            referencedRelation: "stop_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_task_type_id_fkey"
            columns: ["task_type_id"]
            isOneToOne: false
            referencedRelation: "task_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_voided_by_staff_id_fkey"
            columns: ["voided_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      work_shifts: {
        Row: {
          close_reason: string | null
          closed_by_staff_id: string | null
          company_id: string
          created_at: string
          device_id: string | null
          ended_at: string | null
          id: string
          is_force_closed: boolean
          source: string
          started_at: string
          worker_id: string
        }
        Insert: {
          close_reason?: string | null
          closed_by_staff_id?: string | null
          company_id: string
          created_at?: string
          device_id?: string | null
          ended_at?: string | null
          id?: string
          is_force_closed?: boolean
          source?: string
          started_at?: string
          worker_id: string
        }
        Update: {
          close_reason?: string | null
          closed_by_staff_id?: string | null
          company_id?: string
          created_at?: string
          device_id?: string | null
          ended_at?: string | null
          id?: string
          is_force_closed?: boolean
          source?: string
          started_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "work_shifts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          company_id: string
          created_at: string
          failed_login_attempts: number
          full_name: string
          hourly_cost: number
          id: string
          interface_type: string
          is_active: boolean
          locked_until: string | null
          password_hash: string
          photo_url: string | null
          rfid_code: string | null
          skill_level: string | null
          updated_at: string
          username: string
        }
        Insert: {
          company_id: string
          created_at?: string
          failed_login_attempts?: number
          full_name: string
          hourly_cost?: number
          id?: string
          interface_type?: string
          is_active?: boolean
          locked_until?: string | null
          password_hash: string
          photo_url?: string | null
          rfid_code?: string | null
          skill_level?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          company_id?: string
          created_at?: string
          failed_login_attempts?: number
          full_name?: string
          hourly_cost?: number
          id?: string
          interface_type?: string
          is_active?: boolean
          locked_until?: string | null
          password_hash?: string
          photo_url?: string | null
          rfid_code?: string | null
          skill_level?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "workers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      workshop_reclamations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          machine_id: string | null
          message: string
          read_at: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_staff_id: string | null
          status: string
          worker_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          machine_id?: string | null
          message: string
          read_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          status?: string
          worker_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          machine_id?: string | null
          message?: string
          read_at?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          status?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workshop_reclamations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_reclamations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "workshop_reclamations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_reclamations_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "workshop_reclamations_resolved_by_staff_id_fkey"
            columns: ["resolved_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workshop_reclamations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "workshop_reclamations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "workshop_reclamations_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_accounting_summary: {
        Row: {
          company_id: string | null
          expenses_paid: number | null
          expenses_total: number | null
          overdue_invoices_count: number | null
          overdue_supplier_invoices_count: number | null
          pending_expenses: number | null
          pending_revenue: number | null
          revenue_paid: number | null
          revenue_total: number | null
        }
        Insert: {
          company_id?: string | null
          expenses_paid?: never
          expenses_total?: never
          overdue_invoices_count?: never
          overdue_supplier_invoices_count?: never
          pending_expenses?: never
          pending_revenue?: never
          revenue_paid?: never
          revenue_total?: never
        }
        Update: {
          company_id?: string | null
          expenses_paid?: never
          expenses_total?: never
          overdue_invoices_count?: never
          overdue_supplier_invoices_count?: never
          pending_expenses?: never
          pending_revenue?: never
          revenue_paid?: never
          revenue_total?: never
        }
        Relationships: []
      }
      v_inventory_low_stock: {
        Row: {
          category: string | null
          code: string | null
          company_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          location: string | null
          name: string | null
          quantity_on_hand: number | null
          reorder_threshold: number | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          location?: string | null
          name?: string | null
          quantity_on_hand?: number | null
          reorder_threshold?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          code?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          location?: string | null
          name?: string | null
          quantity_on_hand?: number | null
          reorder_threshold?: number | null
          unit?: string | null
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_live_operations: {
        Row: {
          company_id: string | null
          machine_id: string | null
          machine_name: string | null
          piece_name: string | null
          piece_task_id: string | null
          project_id: string | null
          project_name: string | null
          session_id: string | null
          session_type: string | null
          shift_id: string | null
          shift_started_at: string | null
          started_at: string | null
          stop_reason_name: string | null
          task_type_name: string | null
          worker_id: string | null
          worker_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_machine_planning_overview: {
        Row: {
          client_name: string | null
          company_id: string | null
          drawing_url: string | null
          estimated_time_minutes: number | null
          machine_id: string | null
          machine_name: string | null
          manufacturing_order_id: string | null
          material: string | null
          notes: string | null
          order_number: string | null
          piece_ref: string | null
          piece_task_id: string | null
          planned_date: string | null
          planning_id: string | null
          product_name: string | null
          project_id: string | null
          project_name: string | null
          quantity: number | null
          shift_number: string | null
          status: string | null
          worker_id: string | null
          worker_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "planning_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "v_machine_report"
            referencedColumns: ["machine_id"]
          },
          {
            foreignKeyName: "planning_manufacturing_order_id_fkey"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      v_machine_report: {
        Row: {
          company_id: string | null
          current_status: string | null
          downtime_seconds: number | null
          labor_cost: number | null
          last_used_at: string | null
          machine_code: string | null
          machine_id: string | null
          machine_name: string | null
          machine_type: string | null
          production_seconds: number | null
          sessions_count: number | null
          total_seconds: number | null
          workers_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_piece_costing_summary: {
        Row: {
          cnc_cost: number | null
          cnc_hours: number | null
          company_id: string | null
          live_total: number | null
          nomenclature_id: string | null
          project_id: string | null
          saved_total: number | null
          status: string | null
          total_materials: number | null
          total_operations: number | null
        }
        Insert: {
          cnc_cost?: never
          cnc_hours?: never
          company_id?: string | null
          live_total?: never
          nomenclature_id?: string | null
          project_id?: string | null
          saved_total?: number | null
          status?: string | null
          total_materials?: never
          total_operations?: never
        }
        Update: {
          cnc_cost?: never
          cnc_hours?: never
          company_id?: string | null
          live_total?: never
          nomenclature_id?: string | null
          project_id?: string | null
          saved_total?: number | null
          status?: string | null
          total_materials?: never
          total_operations?: never
        }
        Relationships: [
          {
            foreignKeyName: "nomenclatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclatures_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "nomenclatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_piece_task_actuals: {
        Row: {
          actual_cost: number | null
          actual_time_minutes: number | null
          company_id: string | null
          downtime_minutes: number | null
          estimated_cost: number | null
          estimated_time_minutes: number | null
          manufacturing_order_id: string | null
          phase: string | null
          piece_name: string | null
          piece_task_id: string | null
          project_id: string | null
          sequence_order: number | null
          status: string | null
          workers_involved: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pieces_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "pieces_tasks_manufacturing_order_id_fkey"
            columns: ["manufacturing_order_id"]
            isOneToOne: false
            referencedRelation: "manufacturing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "pieces_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_project_actuals: {
        Row: {
          actual_downtime_hours: number | null
          actual_labor_cost: number | null
          actual_production_hours: number | null
          company_id: string | null
          due_date: string | null
          estimated_hours: number | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          quoted_price: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_project_profitability: {
        Row: {
          actual_downtime_hours: number | null
          actual_labor_cost: number | null
          actual_production_hours: number | null
          company_id: string | null
          due_date: string | null
          estimated_hours: number | null
          net_profit: number | null
          project_code: string | null
          project_id: string | null
          project_name: string | null
          quoted_price: number | null
          risk_status: string | null
          status: string | null
          time_variance_percent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
        ]
      }
      v_shift_piece_summary: {
        Row: {
          company_id: string | null
          ended_at: string | null
          id: string | null
          piece_name: string | null
          piece_task_id: string | null
          project_id: string | null
          project_name: string | null
          shift_id: string | null
          started_at: string | null
          total_seconds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_piece_work_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "pieces_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "shift_piece_work_piece_task_id_fkey"
            columns: ["piece_task_id"]
            isOneToOne: false
            referencedRelation: "v_piece_task_actuals"
            referencedColumns: ["piece_task_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_actuals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_profitability"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "shift_piece_work_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "shift_piece_work_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_shift_report"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "shift_piece_work_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shift_report: {
        Row: {
          company_id: string | null
          corrections_count: number | null
          downtime_seconds: number | null
          ended_at: string | null
          events_count: number | null
          labor_cost: number | null
          pieces_worked: number | null
          production_seconds: number | null
          shift_duration_seconds: number | null
          shift_id: string | null
          started_at: string | null
          uncovered_seconds: number | null
          worker_id: string | null
          worker_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_shifts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "work_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_machine_planning_overview"
            referencedColumns: ["worker_id"]
          },
          {
            foreignKeyName: "work_shifts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_shift_session_detail: {
        Row: {
          company_id: string | null
          duration_seconds: number | null
          ended_at: string | null
          event_name: string | null
          machine_name: string | null
          piece_name: string | null
          project_name: string | null
          session_id: string | null
          session_type: string | null
          shift_id: string | null
          started_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_accounting_summary"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "work_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_live_operations"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "work_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "v_shift_report"
            referencedColumns: ["shift_id"]
          },
          {
            foreignKeyName: "work_sessions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "work_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      generate_entity_code: {
        Args: { p_company_id: string; p_entity_type: string; p_prefix: string }
        Returns: string
      }
      get_auth_company_id: { Args: never; Returns: string }
      get_company_subscription_status: {
        Args: never
        Returns: {
          company_id: string
          days_remaining: number
          status: string
          trial_ends_at: string
        }[]
      }
      get_my_account_id: { Args: never; Returns: string }
      get_my_company_id: { Args: never; Returns: string }
      get_platform_settings: {
        Args: never
        Returns: {
          currency: string
          premium_max_databases: number
          premium_max_staff: number
          premium_monthly_price: number
          premium_yearly_price: number
          standard_max_databases: number
          standard_max_staff: number
          standard_monthly_price: number
          standard_yearly_price: number
          trial_days: number
          updated_at: string
        }[]
      }
      is_developer: { Args: never; Returns: boolean }
      is_my_company_owner: {
        Args: { target_company_id: string }
        Returns: boolean
      }
      list_my_databases: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          database_id: string
          database_name: string
          is_owner: boolean
        }[]
      }
      set_active_company: {
        Args: { target_company_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

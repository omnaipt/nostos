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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string
          created_at: string
          id: string
          payload: Json | null
          seq: number
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_email: string
          created_at?: string
          id?: string
          payload?: Json | null
          seq?: number
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          created_at?: string
          id?: string
          payload?: Json | null
          seq?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generations: {
        Row: {
          created_at: string
          dish_name: string
          id: string
          input_tokens: number | null
          output_tokens: number | null
          restaurant_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          dish_name: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          restaurant_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          dish_name?: string
          id?: string
          input_tokens?: number | null
          output_tokens?: number | null
          restaurant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_control_point_turns: {
        Row: {
          control_point_id: string
          restaurant_id: string
          turn_id: string
        }
        Insert: {
          control_point_id: string
          restaurant_id: string
          turn_id: string
        }
        Update: {
          control_point_id?: string
          restaurant_id?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "haccp_control_point_turns_control_point_id_fkey"
            columns: ["control_point_id"]
            isOneToOne: false
            referencedRelation: "haccp_control_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_control_point_turns_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_control_points: {
        Row: {
          active: boolean
          all_turns: boolean
          created_at: string
          created_by: string | null
          deactivated_at: string | null
          id: string
          kind: string
          max_c: number | null
          min_c: number | null
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          all_turns?: boolean
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          id?: string
          kind: string
          max_c?: number | null
          min_c?: number | null
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          all_turns?: boolean
          created_at?: string
          created_by?: string | null
          deactivated_at?: string | null
          id?: string
          kind?: string
          max_c?: number | null
          min_c?: number | null
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "haccp_control_points_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "haccp_kind_defaults"
            referencedColumns: ["kind"]
          },
          {
            foreignKeyName: "haccp_control_points_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_control_points_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_kind_defaults: {
        Row: {
          kind: string
          label: string
          max_c: number | null
          min_c: number | null
          note: string | null
          source_label: string
          source_url: string
        }
        Insert: {
          kind: string
          label: string
          max_c?: number | null
          min_c?: number | null
          note?: string | null
          source_label: string
          source_url: string
        }
        Update: {
          kind?: string
          label?: string
          max_c?: number | null
          min_c?: number | null
          note?: string | null
          source_label?: string
          source_url?: string
        }
        Relationships: []
      }
      haccp_nc_verifications: {
        Row: {
          effective: boolean
          id: string
          nonconformity_id: string
          note: string | null
          restaurant_id: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          effective: boolean
          id?: string
          nonconformity_id: string
          note?: string | null
          restaurant_id: string
          verified_at?: string
          verified_by?: string
        }
        Update: {
          effective?: boolean
          id?: string
          nonconformity_id?: string
          note?: string | null
          restaurant_id?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "haccp_nc_verifications_nonconformity_id_fkey"
            columns: ["nonconformity_id"]
            isOneToOne: false
            referencedRelation: "haccp_nc_status"
            referencedColumns: ["nonconformity_id"]
          },
          {
            foreignKeyName: "haccp_nc_verifications_nonconformity_id_fkey"
            columns: ["nonconformity_id"]
            isOneToOne: false
            referencedRelation: "haccp_nonconformities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nc_verifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nc_verifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_nonconformities: {
        Row: {
          description: string
          executed_by_name: string
          id: string
          immediate_action: string
          limit_text: string | null
          measured_value: string | null
          occurred_at: string
          product_disposition: string
          reading_id: string | null
          reception_id: string | null
          recorded_at: string
          recorded_by: string
          restaurant_id: string
          root_cause_action: string
          service_date: string
          source: string
          turn_id: string | null
        }
        Insert: {
          description: string
          executed_by_name: string
          id?: string
          immediate_action: string
          limit_text?: string | null
          measured_value?: string | null
          occurred_at?: string
          product_disposition: string
          reading_id?: string | null
          reception_id?: string | null
          recorded_at?: string
          recorded_by?: string
          restaurant_id: string
          root_cause_action: string
          service_date: string
          source: string
          turn_id?: string | null
        }
        Update: {
          description?: string
          executed_by_name?: string
          id?: string
          immediate_action?: string
          limit_text?: string | null
          measured_value?: string | null
          occurred_at?: string
          product_disposition?: string
          reading_id?: string | null
          reception_id?: string | null
          recorded_at?: string
          recorded_by?: string
          restaurant_id?: string
          root_cause_action?: string
          service_date?: string
          source?: string
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "haccp_nonconformities_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "haccp_temperature_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nonconformities_reception_id_fkey"
            columns: ["reception_id"]
            isOneToOne: false
            referencedRelation: "haccp_receptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nonconformities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nonconformities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nonconformities_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_receptions: {
        Row: {
          conforming: boolean
          delivered_on: string
          expiry_ok: boolean
          id: string
          note: string | null
          packaging_ok: boolean
          photo_path: string | null
          recorded_at: string
          recorded_by: string
          restaurant_id: string
          service_date: string
          supplier_id: string
          temperature_applicable: boolean
          temperature_c: number | null
          turn_id: string | null
        }
        Insert: {
          conforming: boolean
          delivered_on: string
          expiry_ok: boolean
          id?: string
          note?: string | null
          packaging_ok: boolean
          photo_path?: string | null
          recorded_at?: string
          recorded_by?: string
          restaurant_id: string
          service_date: string
          supplier_id: string
          temperature_applicable?: boolean
          temperature_c?: number | null
          turn_id?: string | null
        }
        Update: {
          conforming?: boolean
          delivered_on?: string
          expiry_ok?: boolean
          id?: string
          note?: string | null
          packaging_ok?: boolean
          photo_path?: string | null
          recorded_at?: string
          recorded_by?: string
          restaurant_id?: string
          service_date?: string
          supplier_id?: string
          temperature_applicable?: boolean
          temperature_c?: number | null
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "haccp_receptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_receptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_receptions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "haccp_supplier_stats"
            referencedColumns: ["supplier_id"]
          },
          {
            foreignKeyName: "haccp_receptions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_receptions_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_rejections: {
        Row: {
          cause: string
          description: string | null
          id: string
          quantity_text: string | null
          reception_id: string
          recorded_at: string
          recorded_by: string
          restaurant_id: string
        }
        Insert: {
          cause: string
          description?: string | null
          id?: string
          quantity_text?: string | null
          reception_id: string
          recorded_at?: string
          recorded_by?: string
          restaurant_id: string
        }
        Update: {
          cause?: string
          description?: string | null
          id?: string
          quantity_text?: string | null
          reception_id?: string
          recorded_at?: string
          recorded_by?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "haccp_rejections_reception_id_fkey"
            columns: ["reception_id"]
            isOneToOne: false
            referencedRelation: "haccp_receptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_rejections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_rejections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_temperature_readings: {
        Row: {
          captured_at: string | null
          control_point_id: string
          id: string
          max_c: number | null
          min_c: number | null
          note: string | null
          recorded_at: string
          recorded_by: string
          rectifies_id: string | null
          restaurant_id: string
          service_date: string
          sync_mode: string
          turn_id: string
          value_c: number
          within_limits: boolean
        }
        Insert: {
          captured_at?: string | null
          control_point_id: string
          id?: string
          max_c?: number | null
          min_c?: number | null
          note?: string | null
          recorded_at?: string
          recorded_by?: string
          rectifies_id?: string | null
          restaurant_id: string
          service_date: string
          sync_mode: string
          turn_id: string
          value_c: number
          within_limits: boolean
        }
        Update: {
          captured_at?: string | null
          control_point_id?: string
          id?: string
          max_c?: number | null
          min_c?: number | null
          note?: string | null
          recorded_at?: string
          recorded_by?: string
          rectifies_id?: string | null
          restaurant_id?: string
          service_date?: string
          sync_mode?: string
          turn_id?: string
          value_c?: number
          within_limits?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "haccp_temperature_readings_control_point_id_fkey"
            columns: ["control_point_id"]
            isOneToOne: false
            referencedRelation: "haccp_control_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_temperature_readings_rectifies_id_fkey"
            columns: ["rectifies_id"]
            isOneToOne: false
            referencedRelation: "haccp_temperature_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_temperature_readings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_temperature_readings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_temperature_readings_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          active: boolean
          category: string | null
          cost_per_unit_cents: number | null
          created_at: string
          id: string
          low_stock_threshold: number | null
          name: string
          restaurant_id: string
          shelf_life_override_days: number | null
          stock_qty: number
          storage_mode: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          cost_per_unit_cents?: number | null
          created_at?: string
          id?: string
          low_stock_threshold?: number | null
          name: string
          restaurant_id: string
          shelf_life_override_days?: number | null
          stock_qty?: number
          storage_mode?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          cost_per_unit_cents?: number | null
          created_at?: string
          id?: string
          low_stock_threshold?: number | null
          name?: string
          restaurant_id?: string
          shelf_life_override_days?: number | null
          stock_qty?: number
          storage_mode?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string | null
          restaurant_name: string
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          restaurant_name: string
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          restaurant_name?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      member_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          email_norm: string
          id: string
          invited_by: string | null
          restaurant_id: string
          role: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          email_norm: string
          id?: string
          invited_by?: string | null
          restaurant_id: string
          role: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          email_norm?: string
          id?: string
          invited_by?: string | null
          restaurant_id?: string
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_imports: {
        Row: {
          created_at: string
          flagged_count: number
          id: string
          items_count: number
          payload: Json | null
          restaurant_id: string
          source_kind: string
          source_ref: string | null
          status: string
          unparsed_note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          flagged_count?: number
          id?: string
          items_count?: number
          payload?: Json | null
          restaurant_id: string
          source_kind?: string
          source_ref?: string | null
          status?: string
          unparsed_note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          flagged_count?: number
          id?: string
          items_count?: number
          payload?: Json | null
          restaurant_id?: string
          source_kind?: string
          source_ref?: string | null
          status?: string
          unparsed_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_variants: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          item_id: string
          label: string
          price_cents: number | null
          restaurant_id: string
          serves: number | null
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          item_id: string
          label: string
          price_cents?: number | null
          restaurant_id: string
          serves?: number | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          item_id?: string
          label?: string
          price_cents?: number | null
          restaurant_id?: string
          serves?: number | null
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_variants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_variants_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          active: boolean
          allergens: string[]
          allergens_confirmed: boolean
          available: boolean
          by_order: boolean
          category_id: string
          created_at: string
          description: string | null
          external_ref: string | null
          id: string
          import_id: string | null
          kind: string
          name: string
          needs_review: boolean
          price_cents: number | null
          price_type: string
          restaurant_id: string
          review_note: string | null
          serves: number | null
          service_date: string | null
          sort_order: number
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string[]
          allergens_confirmed?: boolean
          available?: boolean
          by_order?: boolean
          category_id: string
          created_at?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          import_id?: string | null
          kind?: string
          name: string
          needs_review?: boolean
          price_cents?: number | null
          price_type?: string
          restaurant_id: string
          review_note?: string | null
          serves?: number | null
          service_date?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string[]
          allergens_confirmed?: boolean
          available?: boolean
          by_order?: boolean
          category_id?: string
          created_at?: string
          description?: string | null
          external_ref?: string | null
          id?: string
          import_id?: string | null
          kind?: string
          name?: string
          needs_review?: boolean
          price_cents?: number | null
          price_type?: string
          restaurant_id?: string
          review_note?: string | null
          serves?: number | null
          service_date?: string | null
          sort_order?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "menu_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_translations: {
        Row: {
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          lang: string
          name: string | null
          restaurant_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          lang: string
          name?: string | null
          restaurant_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          lang?: string
          name?: string | null
          restaurant_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_translations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_translations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          menu_item_id: string | null
          name: string
          order_id: string
          price_cents: number
          qty: number
          restaurant_id: string
          variant_id: string | null
        }
        Insert: {
          id?: string
          menu_item_id?: string | null
          name: string
          order_id: string
          price_cents: number
          qty: number
          restaurant_id: string
          variant_id?: string | null
        }
        Update: {
          id?: string
          menu_item_id?: string | null
          name?: string
          order_id?: string
          price_cents?: number
          qty?: number
          restaurant_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "menu_item_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_name: string
          email: string
          id: string
          note: string | null
          phone: string
          pickup_at: string | null
          restaurant_id: string
          status: string
          total_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          email: string
          id?: string
          note?: string | null
          phone: string
          pickup_at?: string | null
          restaurant_id: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          email?: string
          id?: string
          note?: string | null
          phone?: string
          pickup_at?: string | null
          restaurant_id?: string
          status?: string
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_product_map: {
        Row: {
          confirmed: boolean
          created_at: string
          id: string
          menu_item_id: string
          pos_code: string
          pos_description: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          confirmed?: boolean
          created_at?: string
          id?: string
          menu_item_id: string
          pos_code: string
          pos_description?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          confirmed?: boolean
          created_at?: string
          id?: string
          menu_item_id?: string
          pos_code?: string
          pos_description?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_product_map_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_map_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_product_map_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_plans: {
        Row: {
          active: boolean
          base_price_cents: number
          billing_period: string
          code: string
          created_at: string
          id: string
          intro_months: number | null
          intro_price_cents: number | null
          name: string
          unit_metric: string | null
          unit_price_cents: number | null
        }
        Insert: {
          active?: boolean
          base_price_cents: number
          billing_period?: string
          code: string
          created_at?: string
          id?: string
          intro_months?: number | null
          intro_price_cents?: number | null
          name: string
          unit_metric?: string | null
          unit_price_cents?: number | null
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          billing_period?: string
          code?: string
          created_at?: string
          id?: string
          intro_months?: number | null
          intro_price_cents?: number | null
          name?: string
          unit_metric?: string | null
          unit_price_cents?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reservation_events: {
        Row: {
          actor: string
          created_at: string
          event_type: string
          id: string
          reservation_id: string
          restaurant_id: string
          table_id: string | null
        }
        Insert: {
          actor: string
          created_at?: string
          event_type: string
          id?: string
          reservation_id: string
          restaurant_id: string
          table_id?: string | null
        }
        Update: {
          actor?: string
          created_at?: string
          event_type?: string
          id?: string
          reservation_id?: string
          restaurant_id?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_events_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          lang: string
          notes: string | null
          party_size: number
          reserved_at: string
          restaurant_id: string
          service_date: string
          status: string
          table_id: string | null
          turn_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          lang?: string
          notes?: string | null
          party_size: number
          reserved_at: string
          restaurant_id: string
          service_date?: string
          status?: string
          table_id?: string | null
          turn_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          lang?: string
          notes?: string | null
          party_size?: number
          reserved_at?: string
          restaurant_id?: string
          service_date?: string
          status?: string
          table_id?: string | null
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "turns"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_members: {
        Row: {
          created_at: string
          restaurant_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          restaurant_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          restaurant_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          activated_at: string | null
          assignment_mode: string
          created_at: string
          default_duration_min: number
          email: string | null
          haccp_photo_quota_mb: number
          haccp_retention_months: number
          haccp_retention_note: string
          id: string
          is_demo: boolean
          logo_url: string | null
          name: string
          override_reason_code: string | null
          override_reason_note: string | null
          override_until: string | null
          owner_id: string
          paid_until: string | null
          phone: string | null
          plan_code: string | null
          price_override_cents: number | null
          slug: string
          status: string
          suspended_at: string | null
          takeaway_enabled: boolean
          target_margin_pct: number
          theme: string
          timezone: string
          tone: string
          trial_ends_at: string | null
          vertical: string
        }
        Insert: {
          activated_at?: string | null
          assignment_mode?: string
          created_at?: string
          default_duration_min?: number
          email?: string | null
          haccp_photo_quota_mb?: number
          haccp_retention_months?: number
          haccp_retention_note?: string
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name: string
          override_reason_code?: string | null
          override_reason_note?: string | null
          override_until?: string | null
          owner_id: string
          paid_until?: string | null
          phone?: string | null
          plan_code?: string | null
          price_override_cents?: number | null
          slug: string
          status?: string
          suspended_at?: string | null
          takeaway_enabled?: boolean
          target_margin_pct?: number
          theme?: string
          timezone?: string
          tone?: string
          trial_ends_at?: string | null
          vertical?: string
        }
        Update: {
          activated_at?: string | null
          assignment_mode?: string
          created_at?: string
          default_duration_min?: number
          email?: string | null
          haccp_photo_quota_mb?: number
          haccp_retention_months?: number
          haccp_retention_note?: string
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          override_reason_code?: string | null
          override_reason_note?: string | null
          override_until?: string | null
          owner_id?: string
          paid_until?: string | null
          phone?: string | null
          plan_code?: string | null
          price_override_cents?: number | null
          slug?: string
          status?: string
          suspended_at?: string | null
          takeaway_enabled?: boolean
          target_margin_pct?: number
          theme?: string
          timezone?: string
          tone?: string
          trial_ends_at?: string | null
          vertical?: string
        }
        Relationships: []
      }
      saft_import_lines: {
        Row: {
          created_at: string
          id: string
          import_id: string
          invoice_at: string | null
          invoice_date: string | null
          invoice_no: string
          menu_item_id: string | null
          pos_code: string | null
          pos_description: string | null
          qty: number
          restaurant_id: string
          status: string
          unit_price_cents: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_id: string
          invoice_at?: string | null
          invoice_date?: string | null
          invoice_no: string
          menu_item_id?: string | null
          pos_code?: string | null
          pos_description?: string | null
          qty: number
          restaurant_id: string
          status?: string
          unit_price_cents?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          import_id?: string
          invoice_at?: string | null
          invoice_date?: string | null
          invoice_no?: string
          menu_item_id?: string | null
          pos_code?: string | null
          pos_description?: string | null
          qty?: number
          restaurant_id?: string
          status?: string
          unit_price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "saft_import_lines_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "saft_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saft_import_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saft_import_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saft_import_lines_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      saft_imports: {
        Row: {
          applied_at: string | null
          apply_stock: boolean
          created_at: string
          error: string | null
          filename: string | null
          gross_total_cents: number | null
          id: string
          invoices_count: number
          lines_count: number
          matched_count: number
          period_end: string | null
          period_start: string | null
          restaurant_id: string
          status: string
          unmatched_count: number
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          apply_stock?: boolean
          created_at?: string
          error?: string | null
          filename?: string | null
          gross_total_cents?: number | null
          id?: string
          invoices_count?: number
          lines_count?: number
          matched_count?: number
          period_end?: string | null
          period_start?: string | null
          restaurant_id: string
          status?: string
          unmatched_count?: number
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          apply_stock?: boolean
          created_at?: string
          error?: string | null
          filename?: string | null
          gross_total_cents?: number | null
          id?: string
          invoices_count?: number
          lines_count?: number
          matched_count?: number
          period_end?: string | null
          period_start?: string | null
          restaurant_id?: string
          status?: string
          unmatched_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saft_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saft_imports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      shelf_life_defaults: {
        Row: {
          category: string
          id: string
          note: string | null
          shelf_life_days: number
          source: string
          storage_mode: string
        }
        Insert: {
          category: string
          id?: string
          note?: string | null
          shelf_life_days: number
          source: string
          storage_mode: string
        }
        Update: {
          category?: string
          id?: string
          note?: string | null
          shelf_life_days?: number
          source?: string
          storage_mode?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          cost_per_unit_cents: number | null
          created_at: string
          expires_at: string | null
          id: string
          ingredient_id: string
          kind: string
          note: string | null
          qty: number
          restaurant_id: string
          source: string
          source_ref: string | null
          unit: string
        }
        Insert: {
          cost_per_unit_cents?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          ingredient_id: string
          kind: string
          note?: string | null
          qty: number
          restaurant_id: string
          source?: string
          source_ref?: string | null
          unit: string
        }
        Update: {
          cost_per_unit_cents?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          ingredient_id?: string
          kind?: string
          note?: string | null
          qty?: number
          restaurant_id?: string
          source?: string
          source_ref?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_aliases: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          raw_name_norm: string
          restaurant_id: string
          supplier_norm: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          raw_name_norm: string
          restaurant_id: string
          supplier_norm: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          raw_name_norm?: string
          restaurant_id?: string
          supplier_norm?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_aliases_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_aliases_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_aliases_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          name_norm: string
          nif: string | null
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          name_norm: string
          nif?: string | null
          restaurant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          name_norm?: string
          nif?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          active: boolean
          combinable: boolean
          created_at: string
          id: string
          label: string
          restaurant_id: string
          seats: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          combinable?: boolean
          created_at?: string
          id?: string
          label: string
          restaurant_id: string
          seats: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          combinable?: boolean
          created_at?: string
          id?: string
          label?: string
          restaurant_id?: string
          seats?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_sheet_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string | null
          name: string
          qty: number
          restaurant_id: string
          sort_order: number
          tech_sheet_id: string
          unit: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id?: string | null
          name: string
          qty: number
          restaurant_id: string
          sort_order?: number
          tech_sheet_id: string
          unit: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string | null
          name?: string
          qty?: number
          restaurant_id?: string
          sort_order?: number
          tech_sheet_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_sheet_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sheet_ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sheet_ingredients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sheet_ingredients_tech_sheet_id_fkey"
            columns: ["tech_sheet_id"]
            isOneToOne: false
            referencedRelation: "tech_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_sheets: {
        Row: {
          ai_generated: boolean
          created_at: string
          id: string
          menu_item_id: string
          notes: string | null
          restaurant_id: string
          servings: number
          status: string
          steps: string[]
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean
          created_at?: string
          id?: string
          menu_item_id: string
          notes?: string | null
          restaurant_id: string
          servings?: number
          status?: string
          steps?: string[]
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean
          created_at?: string
          id?: string
          menu_item_id?: string
          notes?: string | null
          restaurant_id?: string
          servings?: number
          status?: string
          steps?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_sheets_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sheets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_sheets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      turns: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          restaurant_id: string
          service: string | null
          start_time: string
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          restaurant_id: string
          service?: string | null
          start_time: string
          weekdays: number[]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          restaurant_id?: string
          service?: string | null
          start_time?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "turns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_tenant_overview: {
        Row: {
          base_price_cents: number | null
          created_at: string | null
          effective_price_cents: number | null
          id: string | null
          is_demo: boolean | null
          is_overdue: boolean | null
          name: string | null
          override_reason: string | null
          paid_until: string | null
          plan_code: string | null
          status: string | null
          user_count: number | null
        }
        Relationships: []
      }
      haccp_nc_status: {
        Row: {
          effective: boolean | null
          nonconformity_id: string | null
          occurred_at: string | null
          open_hours: number | null
          overdue: boolean | null
          restaurant_id: string | null
          service_date: string | null
          status: string | null
          verified_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "haccp_nonconformities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haccp_nonconformities_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      haccp_supplier_stats: {
        Row: {
          last_reception_at: string | null
          last_rejection_at: string | null
          name: string | null
          receptions_count: number | null
          rejections_count: number | null
          restaurant_id: string | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_tenant_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      advance_order: {
        Args: { p_note?: string; p_order_id: string; p_status: string }
        Returns: undefined
      }
      apply_inventory_count: {
        Args: { p_counts: Json; p_note: string; p_restaurant_id: string }
        Returns: Json
      }
      haccp_burst_check: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          control_points: number
          readings: number
          recorded_by: string
          window_start: string
        }[]
      }
      haccp_expected_readings: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: {
          closes_at: string
          control_point_id: string
          control_point_name: string
          kind: string
          nc_id: string
          nc_status: string
          opens_at: string
          reading_id: string
          recorded_at: string
          service_date: string
          status: string
          sync_mode: string
          turn_id: string
          turn_label: string
          value_c: number
          within_limits: boolean
        }[]
      }
      haccp_now: { Args: never; Returns: string }
      haccp_period_summary: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string }
        Returns: Json
      }
      haccp_purge_expired: { Args: { p_restaurant_id: string }; Returns: Json }
      haccp_record_temperature: {
        Args: {
          p_captured_at?: string
          p_control_point_id: string
          p_note?: string
          p_rectifies_id?: string
          p_turn_id: string
          p_value_c: number
        }
        Returns: {
          id: string
          service_date: string
          sync_mode: string
          within_limits: boolean
        }[]
      }
      haccp_service_date: {
        Args: { p_at?: string; p_restaurant_id: string }
        Returns: string
      }
      haccp_storage_usage_bytes: {
        Args: { p_restaurant_id: string }
        Returns: number
      }
      haccp_turn_status: {
        Args: { p_restaurant_id: string; p_service_date?: string }
        Returns: {
          closes_at: string
          control_point_id: string
          control_point_name: string
          kind: string
          nc_id: string
          nc_status: string
          opens_at: string
          reading_id: string
          recorded_at: string
          service_date: string
          status: string
          sync_mode: string
          turn_id: string
          turn_label: string
          value_c: number
          within_limits: boolean
        }[]
      }
      haccp_turn_window: {
        Args: {
          p_restaurant_id: string
          p_service_date: string
          p_turn_id: string
        }
        Returns: {
          closes_at: string
          cutoff_at: string
          opens_at: string
        }[]
      }
      ingredient_avg_cost: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
      invite_member: {
        Args: { p_email: string; p_role: string }
        Returns: string
      }
      is_restaurant_member: { Args: { target: string }; Returns: boolean }
      is_restaurant_owner: { Args: { target: string }; Returns: boolean }
      is_restaurant_reader: { Args: { target: string }; Returns: boolean }
      list_team_members: {
        Args: { p_restaurant_id: string }
        Returns: {
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      member_role: { Args: { p_restaurant_id: string }; Returns: string }
      menu_translation_progress: {
        Args: { p_restaurant: string }
        Returns: {
          lang: string
          rascunhos: number
          total_itens: number
          validadas: number
        }[]
      }
      public_create_lead: {
        Args: {
          p_email: string
          p_message: string
          p_name: string
          p_phone: string
          p_restaurant_name: string
        }
        Returns: string
      }
      public_create_reservation: {
        Args: {
          p_email: string
          p_lang?: string
          p_name: string
          p_notes: string
          p_party_size: number
          p_phone: string
          p_service_date: string
          p_slug: string
          p_turn_id: string
        }
        Returns: string
      }
      public_menu_by_slug: {
        Args: { p_lang?: string; p_slug: string }
        Returns: {
          allergens: string[]
          available: boolean
          by_order: boolean
          category_id: string
          category_label: string
          category_sort: number
          item_description: string
          item_id: string
          item_name: string
          item_sort: number
          kind: string
          price_cents: number
          price_type: string
          serves: number
          variants: Json
        }[]
      }
      public_menu_langs: { Args: { p_slug: string }; Returns: string[] }
      public_restaurant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          logo_url: string
          name: string
          phone: string
          slug: string
          takeaway_enabled: boolean
          theme: string
        }[]
      }
      public_turns_for_date: {
        Args: { p_date: string; p_lang?: string; p_slug: string }
        Returns: {
          id: string
          label: string
          service: string
          start_time: string
        }[]
      }
      publish_menu_import: {
        Args: { p_import_id: string; p_menu: Json; p_restaurant_id: string }
        Returns: Json
      }
      sales_by_item: {
        Args: {
          p_from: string
          p_restaurant: string
          p_to: string
          p_turns?: string[]
          p_weekdays?: number[]
        }
        Returns: {
          days: number
          gross_cents: number
          item_name: string
          menu_item_id: string
          qty: number
        }[]
      }
      sales_lines: {
        Args: { p_from: string; p_restaurant: string; p_to: string }
        Returns: {
          doc_ref: string
          gross_cents: number
          mapped: boolean
          menu_item_id: string
          qty: number
          service_date: string
          sold_at: string
          source: string
          turn_id: string
          weekday: number
        }[]
      }
      sales_summary: {
        Args: {
          p_from: string
          p_restaurant: string
          p_to: string
          p_turns?: string[]
          p_weekdays?: number[]
        }
        Returns: {
          days: number
          docs: number
          first_date: string
          gross_cents: number
          last_date: string
          lines_mapped: number
          lines_no_time: number
          lines_total: number
          units: number
        }[]
      }
      slugify: { Args: { input: string }; Returns: string }
      submit_takeaway_order: {
        Args: {
          p_customer_name: string
          p_email: string
          p_items: Json
          p_note: string
          p_phone: string
          p_pickup_at: string
          p_slug: string
        }
        Returns: string
      }
      turn_local: {
        Args: { p_local: string; p_restaurant: string }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
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

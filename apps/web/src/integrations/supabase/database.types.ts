// Gerado por `supabase gen types typescript --project-id emuwqkdummdmacnkltte`.
// TWEAK MANUAL (manter ao regenerar): restaurants.Insert.slug é opcional —
// o slug é preenchido pelo trigger set_restaurant_slug (migration 0004);
// o gerador marca-o required por ser NOT NULL sem default.
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
            referencedRelation: "restaurants"
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
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          assignment_mode: string
          created_at: string
          default_duration_min: number
          email: string | null
          id: string
          name: string
          owner_id: string
          phone: string | null
          slug: string
          target_margin_pct: number
          timezone: string
          tone: string
          vertical: string
        }
        Insert: {
          assignment_mode?: string
          created_at?: string
          default_duration_min?: number
          email?: string | null
          id?: string
          name: string
          owner_id: string
          phone?: string | null
          slug?: string
          target_margin_pct?: number
          timezone?: string
          tone?: string
          vertical?: string
        }
        Update: {
          assignment_mode?: string
          created_at?: string
          default_duration_min?: number
          email?: string | null
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
          slug?: string
          target_margin_pct?: number
          timezone?: string
          tone?: string
          vertical?: string
        }
        Relationships: []
      }
      saft_import_lines: {
        Row: {
          created_at: string
          id: string
          import_id: string
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
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      saft_imports: {
        Row: {
          applied_at: string | null
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
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_inventory_count: {
        Args: { p_counts: Json; p_note: string; p_restaurant_id: string }
        Returns: Json
      }
      ingredient_avg_cost: {
        Args: { p_ingredient_id: string }
        Returns: number
      }
      is_restaurant_member: { Args: { target: string }; Returns: boolean }
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
        Args: { p_slug: string }
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
      public_restaurant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          name: string
          phone: string
          slug: string
        }[]
      }
      public_turns_for_date: {
        Args: { p_date: string; p_slug: string }
        Returns: {
          id: string
          label: string
          service: string
          start_time: string
        }[]
      }
      slugify: { Args: { input: string }; Returns: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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

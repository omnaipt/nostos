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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
          cost_per_unit_cents: number | null
          created_at: string
          id: string
          name: string
          restaurant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cost_per_unit_cents?: number | null
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cost_per_unit_cents?: number | null
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
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
      menu_items: {
        Row: {
          active: boolean
          allergens: string[]
          available: boolean
          category_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          price_cents: number | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          allergens?: string[]
          available?: boolean
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_cents?: number | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          allergens?: string[]
          available?: boolean
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number | null
          restaurant_id?: string
          sort_order?: number
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
            foreignKeyName: "menu_items_restaurant_id_fkey"
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
          timezone: string
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
          timezone?: string
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
          timezone?: string
          vertical?: string
        }
        Relationships: []
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
      is_restaurant_member: { Args: { target: string }; Returns: boolean }
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
          category_id: string
          category_label: string
          category_sort: number
          item_description: string
          item_id: string
          item_name: string
          item_sort: number
          price_cents: number
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

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
      email_sources: {
        Row: {
          account_email: string | null
          clerk_user_id: string
          created_at: string
          id: string
          label: string
          last_error: string | null
          last_synced_at: string | null
          poll_enabled: boolean
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          clerk_user_id: string
          created_at?: string
          id?: string
          label?: string
          last_error?: string | null
          last_synced_at?: string | null
          poll_enabled?: boolean
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          clerk_user_id?: string
          created_at?: string
          id?: string
          label?: string
          last_error?: string | null
          last_synced_at?: string | null
          poll_enabled?: boolean
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_files: {
        Row: {
          batch_id: string | null
          batch_label: string | null
          category: string
          category_correct: boolean | null
          category_override: string | null
          content: string
          created_at: string
          event_type: string
          file_type: string
          id: string
          name: string
          quality: string | null
          size: string
        }
        Insert: {
          batch_id?: string | null
          batch_label?: string | null
          category: string
          category_correct?: boolean | null
          category_override?: string | null
          content: string
          created_at?: string
          event_type: string
          file_type: string
          id?: string
          name: string
          quality?: string | null
          size: string
        }
        Update: {
          batch_id?: string | null
          batch_label?: string | null
          category?: string
          category_correct?: boolean | null
          category_override?: string | null
          content?: string
          created_at?: string
          event_type?: string
          file_type?: string
          id?: string
          name?: string
          quality?: string | null
          size?: string
        }
        Relationships: []
      }
      generation_presets: {
        Row: {
          created_at: string
          details: string | null
          event_type: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          event_type: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          details?: string | null
          event_type?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      harness_checkpoints: {
        Row: {
          checkpoint_id: string
          created_at: string
          criteria: string
          evidence: Json | null
          id: string
          material_snapshot: Json | null
          ordinal: number
          run_id: string
          status: string
        }
        Insert: {
          checkpoint_id: string
          created_at?: string
          criteria?: string
          evidence?: Json | null
          id?: string
          material_snapshot?: Json | null
          ordinal: number
          run_id: string
          status: string
        }
        Update: {
          checkpoint_id?: string
          created_at?: string
          criteria?: string
          evidence?: Json | null
          id?: string
          material_snapshot?: Json | null
          ordinal?: number
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_checkpoints_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "harness_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      harness_runs: {
        Row: {
          agent_id: string
          attempts: number
          created_at: string
          current_stage: string
          id: string
          input_summary: string
          model: string
          result: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          attempts?: number
          created_at?: string
          current_stage?: string
          id?: string
          input_summary?: string
          model: string
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          attempts?: number
          created_at?: string
          current_stage?: string
          id?: string
          input_summary?: string
          model?: string
          result?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_environments: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          token: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          token?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          token?: string | null
          url?: string
        }
        Relationships: []
      }
      mcp_logs: {
        Row: {
          created_at: string
          environment: string
          file_name: string
          id: string
          request: Json
          response: Json
          status: string
          tool_name: string
        }
        Insert: {
          created_at?: string
          environment?: string
          file_name: string
          id?: string
          request?: Json
          response?: Json
          status?: string
          tool_name: string
        }
        Update: {
          created_at?: string
          environment?: string
          file_name?: string
          id?: string
          request?: Json
          response?: Json
          status?: string
          tool_name?: string
        }
        Relationships: []
      }
      mcp_test_cases: {
        Row: {
          category: string
          created_at: string
          expected_tool: string
          file_name: string
          file_type: string
          id: string
          name: string
        }
        Insert: {
          category: string
          created_at?: string
          expected_tool: string
          file_name: string
          file_type: string
          id?: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          expected_tool?: string
          file_name?: string
          file_type?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      synced_emails: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          date_header: string
          from_addr: string
          id: string
          provider_message_id: string
          received_at: string | null
          snippet: string
          source_id: string
          status: string
          subject: string
          to_addr: string
        }
        Insert: {
          attachments?: Json
          body?: string
          created_at?: string
          date_header?: string
          from_addr?: string
          id?: string
          provider_message_id: string
          received_at?: string | null
          snippet?: string
          source_id: string
          status?: string
          subject?: string
          to_addr?: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          date_header?: string
          from_addr?: string
          id?: string
          provider_message_id?: string
          received_at?: string | null
          snippet?: string
          source_id?: string
          status?: string
          subject?: string
          to_addr?: string
        }
        Relationships: [
          {
            foreignKeyName: "synced_emails_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "email_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

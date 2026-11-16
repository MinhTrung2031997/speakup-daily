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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      answers: {
        Row: {
          answer: string
          answer_date: string
          builder: Json | null
          client_id: string | null
          created_at: string
          id: string
          input_mode: string
          question: string
          question_id: string | null
          retry: Json | null
          retry_score: number | null
          topic_name: string
          updated_at: string
          upgrade: Json | null
          user_id: string
        }
        Insert: {
          answer?: string
          answer_date?: string
          builder?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          input_mode?: string
          question?: string
          question_id?: string | null
          retry?: Json | null
          retry_score?: number | null
          topic_name?: string
          updated_at?: string
          upgrade?: Json | null
          user_id?: string
        }
        Update: {
          answer?: string
          answer_date?: string
          builder?: Json | null
          client_id?: string | null
          created_at?: string
          id?: string
          input_mode?: string
          question?: string
          question_id?: string | null
          retry?: Json | null
          retry_score?: number | null
          topic_name?: string
          updated_at?: string
          upgrade?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_user_id_fkey"
            columns: ["question_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_questions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          nudge: string | null
          position: number
          role: string
          session_id: string
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nudge?: string | null
          position: number
          role: string
          session_id: string
          text: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          nudge?: string | null
          position?: number
          role?: string
          session_id?: string
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          client_id: string | null
          created_at: string
          feedback: Json | null
          id: string
          question: string
          question_id: string | null
          session_date: string
          topic_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          question?: string
          question_id?: string | null
          session_date?: string
          topic_name?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          question?: string
          question_id?: string | null
          session_date?: string
          topic_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_question_id_user_id_fkey"
            columns: ["question_id", "user_id"]
            isOneToOne: false
            referencedRelation: "daily_questions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      daily_activity: {
        Row: {
          activity_date: string
          created_at: string
          practice_count: number
          seconds_spoken: number
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          created_at?: string
          practice_count?: number
          seconds_spoken?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          activity_date?: string
          created_at?: string
          practice_count?: number
          seconds_spoken?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_questions: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          question: string
          question_date: string
          starters: string[]
          topic_id: string | null
          topic_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          question: string
          question_date?: string
          starters?: string[]
          topic_id?: string | null
          topic_name?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          question?: string
          question_date?: string
          starters?: string[]
          topic_id?: string | null
          topic_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_questions_topic_id_user_id_fkey"
            columns: ["topic_id", "user_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      fluency_stats: {
        Row: {
          answer_id: string | null
          chat_session_id: string | null
          created_at: string
          duration_seconds: number
          filler_count: number
          filler_words: Json
          id: string
          kind: string
          long_pauses: number
          longest_pause_seconds: number
          recorded_date: string
          restart_examples: string[]
          restarts: number
          tip: string
          updated_at: string
          user_id: string
          words: number
          wpm: number
        }
        Insert: {
          answer_id?: string | null
          chat_session_id?: string | null
          created_at?: string
          duration_seconds?: number
          filler_count?: number
          filler_words?: Json
          id?: string
          kind?: string
          long_pauses?: number
          longest_pause_seconds?: number
          recorded_date?: string
          restart_examples?: string[]
          restarts?: number
          tip?: string
          updated_at?: string
          user_id?: string
          words?: number
          wpm?: number
        }
        Update: {
          answer_id?: string | null
          chat_session_id?: string | null
          created_at?: string
          duration_seconds?: number
          filler_count?: number
          filler_words?: Json
          id?: string
          kind?: string
          long_pauses?: number
          longest_pause_seconds?: number
          recorded_date?: string
          restart_examples?: string[]
          restarts?: number
          tip?: string
          updated_at?: string
          user_id?: string
          words?: number
          wpm?: number
        }
        Relationships: [
          {
            foreignKeyName: "fluency_stats_answer_id_user_id_fkey"
            columns: ["answer_id", "user_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "fluency_stats_chat_session_id_user_id_fkey"
            columns: ["chat_session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      phrase_reviews: {
        Row: {
          created_at: string
          feedback: string
          id: string
          ok: boolean
          phrase_id: string
          review_date: string
          sentence: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback?: string
          id?: string
          ok: boolean
          phrase_id: string
          review_date?: string
          sentence: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          feedback?: string
          id?: string
          ok?: boolean
          phrase_id?: string
          review_date?: string
          sentence?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phrase_reviews_phrase_id_user_id_fkey"
            columns: ["phrase_id", "user_id"]
            isOneToOne: false
            referencedRelation: "phrases"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      phrases: {
        Row: {
          added_date: string
          client_id: string | null
          created_at: string
          due: string
          example: string
          id: string
          last_reviewed_at: string | null
          meaning: string
          phrase: string
          source: string
          source_answer_id: string | null
          stage: number
          updated_at: string
          user_id: string
        }
        Insert: {
          added_date?: string
          client_id?: string | null
          created_at?: string
          due?: string
          example?: string
          id?: string
          last_reviewed_at?: string | null
          meaning?: string
          phrase: string
          source?: string
          source_answer_id?: string | null
          stage?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          added_date?: string
          client_id?: string | null
          created_at?: string
          due?: string
          example?: string
          id?: string
          last_reviewed_at?: string | null
          meaning?: string
          phrase?: string
          source?: string
          source_answer_id?: string | null
          stage?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "phrases_source_answer_id_user_id_fkey"
            columns: ["source_answer_id", "user_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string
          created_at: string
          facts: string
          goals: string
          hobbies: string
          job: string
          level: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string
          created_at?: string
          facts?: string
          goals?: string
          hobbies?: string
          job?: string
          level?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          city?: string
          created_at?: string
          facts?: string
          goals?: string
          hobbies?: string
          job?: string
          level?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shadowing_attempts: {
        Row: {
          answer_id: string | null
          attempt_date: string
          chat_message_id: string | null
          created_at: string
          duration_seconds: number
          id: string
          recording_path: string | null
          score: number | null
          sentence: string
          sentence_index: number
          source_text: string
          transcript: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_id?: string | null
          attempt_date?: string
          chat_message_id?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          recording_path?: string | null
          score?: number | null
          sentence: string
          sentence_index?: number
          source_text?: string
          transcript?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          answer_id?: string | null
          attempt_date?: string
          chat_message_id?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          recording_path?: string | null
          score?: number | null
          sentence?: string
          sentence_index?: number
          source_text?: string
          transcript?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shadowing_attempts_answer_id_user_id_fkey"
            columns: ["answer_id", "user_id"]
            isOneToOne: false
            referencedRelation: "answers"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "shadowing_attempts_chat_message_id_user_id_fkey"
            columns: ["chat_message_id", "user_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      topics: {
        Row: {
          active: boolean
          created_at: string
          emoji: string
          id: string
          is_custom: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          emoji?: string
          id?: string
          is_custom?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          emoji?: string
          id?: string
          is_custom?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          dark: boolean
          fast_mode: boolean
          model: string
          onboarded: boolean
          rate: number
          updated_at: string
          user_id: string
          voice_uri: string
        }
        Insert: {
          created_at?: string
          dark?: boolean
          fast_mode?: boolean
          model?: string
          onboarded?: boolean
          rate?: number
          updated_at?: string
          user_id?: string
          voice_uri?: string
        }
        Update: {
          created_at?: string
          dark?: boolean
          fast_mode?: boolean
          model?: string
          onboarded?: boolean
          rate?: number
          updated_at?: string
          user_id?: string
          voice_uri?: string
        }
        Relationships: []
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

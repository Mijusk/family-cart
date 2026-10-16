
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "calendar_shares": {
                  Row: {
                    "calendar_id": string,"group_id": string,"level": string,"shared_at": string,"shared_by": string | null
                  }
                  Insert: {
                    "calendar_id": string,"group_id": string,"level"?: string,"shared_at"?: string,"shared_by"?: string | null
                  }
                  Update: {
                    "calendar_id"?: string,"group_id"?: string,"level"?: string,"shared_at"?: string,"shared_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendar_shares_calendar_id_fkey"
      columns: ["calendar_id"]
isOneToOne: false
      referencedRelation: "calendars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_shares_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendar_shares_shared_by_fkey"
      columns: ["shared_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"calendars": {
                  Row: {
                    "color": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"deletion_batch": string | null,"id": string,"name": string,"owner_id": string,"position": number,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "color"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"deletion_batch"?: string | null,"id"?: string,"name": string,"owner_id": string,"position"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"deletion_batch"?: string | null,"id"?: string,"name"?: string,"owner_id"?: string,"position"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "calendars_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendars_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendars_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "calendars_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"event_exceptions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"event_id": string,"occurrence_date": string,"overrides": NonNullable<Json>,"status": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"event_id": string,"occurrence_date": string,"overrides"?: NonNullable<Json>,"status": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"event_id"?: string,"occurrence_date"?: string,"overrides"?: NonNullable<Json>,"status"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_exceptions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_exceptions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_exceptions_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"event_history": {
                  Row: {
                    "action": string,"after": Json | null,"before": Json | null,"calendar_id": string,"changed_at": string,"changed_by": string | null,"event_id": string,"id": number
                  }
                  Insert: {
                    "action": string,"after"?: Json | null,"before"?: Json | null,"calendar_id": string,"changed_at"?: string,"changed_by"?: string | null,"event_id": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"after"?: Json | null,"before"?: Json | null,"calendar_id"?: string,"changed_at"?: string,"changed_by"?: string | null,"event_id"?: string,"id"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_history_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"event_participants": {
                  Row: {
                    "event_id": string,"person_id": string
                  }
                  Insert: {
                    "event_id": string,"person_id": string
                  }
                  Update: {
                    "event_id"?: string,"person_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_participants_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_participants_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"event_shares": {
                  Row: {
                    "event_id": string,"group_id": string,"shared_at": string,"shared_by": string | null
                  }
                  Insert: {
                    "event_id": string,"group_id": string,"shared_at"?: string,"shared_by"?: string | null
                  }
                  Update: {
                    "event_id"?: string,"group_id"?: string,"shared_at"?: string,"shared_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_shares_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_shares_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_shares_shared_by_fkey"
      columns: ["shared_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "all_day": boolean,"calendar_id": string,"created_at": string,"created_by": string | null,"deleted_at": string | null,"deleted_by": string | null,"deletion_batch": string | null,"end_time": string | null,"id": string,"location": string | null,"notes": string | null,"repeat": string,"repeat_until": string | null,"repeat_weekdays": (number)[] | null,"start_date": string,"start_time": string | null,"timezone": string,"title": string,"updated_at": string,"updated_by": string | null,"event_snapshot": Json | null
                  }
                  Insert: {
                    "all_day"?: boolean,"calendar_id": string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"deletion_batch"?: string | null,"end_time"?: string | null,"id"?: string,"location"?: string | null,"notes"?: string | null,"repeat"?: string,"repeat_until"?: string | null,"repeat_weekdays"?: (number)[] | null,"start_date": string,"start_time"?: string | null,"timezone"?: string,"title": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "all_day"?: boolean,"calendar_id"?: string,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"deleted_by"?: string | null,"deletion_batch"?: string | null,"end_time"?: string | null,"id"?: string,"location"?: string | null,"notes"?: string | null,"repeat"?: string,"repeat_until"?: string | null,"repeat_weekdays"?: (number)[] | null,"start_date"?: string,"start_time"?: string | null,"timezone"?: string,"title"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_calendar_id_fkey"
      columns: ["calendar_id"]
isOneToOne: false
      referencedRelation: "calendars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_deleted_by_fkey"
      columns: ["deleted_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "calendar_enabled": boolean,"created_at": string,"created_by": string | null,"id": string,"invite_code": string,"name": string,"shopping_enabled": boolean,"timezone": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "calendar_enabled"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string,"name": string,"shopping_enabled"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "calendar_enabled"?: boolean,"created_at"?: string,"created_by"?: string | null,"id"?: string,"invite_code"?: string,"name"?: string,"shopping_enabled"?: boolean,"timezone"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "added_at": string,"added_by": string | null,"group_id": string,"id": string,"name": string,"note": string | null,"photo_path": string | null,"purchased_at": string | null,"purchased_by": string | null,"quantity": number,"status": Database["public"]['Enums']["item_status"],"trip_id": string | null
                  }
                  Insert: {
                    "added_at"?: string,"added_by"?: string | null,"group_id": string,"id"?: string,"name": string,"note"?: string | null,"photo_path"?: string | null,"purchased_at"?: string | null,"purchased_by"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["item_status"],"trip_id"?: string | null
                  }
                  Update: {
                    "added_at"?: string,"added_by"?: string | null,"group_id"?: string,"id"?: string,"name"?: string,"note"?: string | null,"photo_path"?: string | null,"purchased_at"?: string | null,"purchased_by"?: string | null,"quantity"?: number,"status"?: Database["public"]['Enums']["item_status"],"trip_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "items_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_purchased_by_fkey"
      columns: ["purchased_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "items_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"group_id": string,"id": string,"left_at": string | null,"person_id": string,"role": string,"status": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"left_at"?: string | null,"person_id": string,"role"?: string,"status"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"left_at"?: string | null,"person_id"?: string,"role"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_person_id_fkey"
      columns: ["person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"people": {
                  Row: {
                    "claim_code": string | null,"color": string,"created_at": string,"created_by": string | null,"display_name": string,"id": string,"last_calendar_id": string | null,"updated_at": string,"updated_by": string | null,"user_id": string | null
                  }
                  Insert: {
                    "claim_code"?: string | null,"color"?: string,"created_at"?: string,"created_by"?: string | null,"display_name": string,"id"?: string,"last_calendar_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "claim_code"?: string | null,"color"?: string,"created_at"?: string,"created_by"?: string | null,"display_name"?: string,"id"?: string,"last_calendar_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_last_calendar_id_fkey"
      columns: ["last_calendar_id"]
isOneToOne: false
      referencedRelation: "calendars"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "people_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "display_name": string,"group_id": string,"id": string,"last_quantity": number,"normalized_name": string,"times_used": number,"updated_at": string
                  }
                  Insert: {
                    "display_name": string,"group_id": string,"id"?: string,"last_quantity"?: number,"normalized_name": string,"times_used"?: number,"updated_at"?: string
                  }
                  Update: {
                    "display_name"?: string,"group_id"?: string,"id"?: string,"last_quantity"?: number,"normalized_name"?: string,"times_used"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "closed_reason": string | null,"finished_at": string | null,"group_id": string,"id": string,"member_id": string,"started_at": string
                  }
                  Insert: {
                    "closed_reason"?: string | null,"finished_at"?: string | null,"group_id": string,"id"?: string,"member_id": string,"started_at"?: string
                  }
                  Update: {
                    "closed_reason"?: string | null,"finished_at"?: string | null,"group_id"?: string,"id"?: string,"member_id"?: string,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "trips_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"busy_events":
{ Args: { "gid": string }; Returns: {
              "all_day": boolean,"end_time": string,"exceptions": Json,"id": string,"owner_id": string,"repeat": string,"repeat_until": string,"repeat_weekdays": (number)[],"start_date": string,"start_time": string,"timezone": string
            }[]
                           },
"can_edit_calendar":
{ Args: { "cid": string }; Returns: boolean
                           },
"can_edit_event":
{ Args: { "eid": string }; Returns: boolean
                           },
"can_manage_person":
{ Args: { "pid": string }; Returns: boolean
                           },
"can_see_person":
{ Args: { "pid": string }; Returns: boolean
                           },
"can_share_calendar":
{ Args: { "cid": string,"gid": string }; Returns: boolean
                           },
"can_share_event":
{ Args: { "eid": string,"gid": string }; Returns: boolean
                           },
"can_use_group_folder":
{ Args: { "object_name": string }; Returns: boolean
                           },
"can_view_calendar":
{ Args: { "cid": string }; Returns: boolean
                           },
"can_view_event":
{ Args: { "eid": string }; Returns: boolean
                           },
"cancel_trip":
{ Args: { "trip_id": string }; Returns: undefined
                           },
"claim_profile":
{ Args: { "code": string }; Returns: string
                           },
"close_stale_trips":
{ Args: { "max_age"?: string }; Returns: number
                           },
"close_trip":
{ Args: { "reason": string,"target_trip_id": string }; Returns: number
                           },
"create_claim_code":
{ Args: { "pid": string }; Returns: string
                           },
"create_group":
{ Args: { "group_name": string,"with_calendar"?: boolean,"with_shopping"?: boolean }; Returns: string
                           },
"create_profile":
{ Args: { "display_name": string,"gid": string }; Returns: string
                           },
"delete_calendar":
{ Args: { "calendar_id": string }; Returns: string
                           },
"delete_event":
{ Args: { "event_id": string }; Returns: string
                           },
"editable_calendar_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"empty_trash":
{ Args: { "max_age"?: string }; Returns: number
                           },
"event_owners":
{ Args: { "event_ids": (string)[] }; Returns: {
              "color": string,"event_id": string,"owner_id": string
            }[]
                           },
"event_snapshot":
{ Args: { "e": Database["public"]['Tables']["events"]['Row'] }; Returns: Json
                           },
"finish_trip":
{ Args: { "trip_id": string }; Returns: number
                           },
"generate_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"group_by_invite":
{ Args: { "code": string }; Returns: {
              "id": string,"member_count": number,"name": string
            }[]
                           },
"is_group_admin":
{ Args: { "gid": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "gid": string }; Returns: boolean
                           },
"is_live_calendar":
{ Args: { "cid": string }; Returns: boolean
                           },
"is_live_event":
{ Args: { "eid": string }; Returns: boolean
                           },
"leave_group":
{ Args: { "gid": string }; Returns: undefined
                           },
"merge_item":
{ Args: { "add_quantity": number,"extra_note"?: string,"item_id": string }; Returns: {
              "added_at": string,
"added_by": string | null,
"group_id": string,
"id": string,
"name": string,
"note": string | null,
"photo_path": string | null,
"purchased_at": string | null,
"purchased_by": string | null,
"quantity": number,
"status": Database["public"]['Enums']["item_status"],
"trip_id": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "items"
        isOneToOne: true
        isSetofReturn: false
      } },
"my_member_id":
{ Args: { "gid": string }; Returns: string
                           },
"my_person_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"normalize_name":
{ Args: { "name": string }; Returns: string
                           },
"notify_busy_groups":
{ Args: { "cid": string }; Returns: undefined
                           },
"profile_by_claim_code":
{ Args: { "code": string }; Returns: {
              "display_name": string,"id": string
            }[]
                           },
"purge_calendar":
{ Args: { "calendar_id": string }; Returns: undefined
                           },
"purge_event":
{ Args: { "event_id": string }; Returns: undefined
                           },
"random_person_color":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"regenerate_invite_code":
{ Args: { "gid": string }; Returns: string
                           },
"reject_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"remember_product":
{ Args: { "gid": string,"product_name": string,"quantity": number }; Returns: undefined
                           },
"remove_member":
{ Args: { "member_id": string }; Returns: undefined
                           },
"request_join":
{ Args: { "code": string }; Returns: string
                           },
"require_person":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"restore_calendar":
{ Args: { "calendar_id": string }; Returns: undefined
                           },
"restore_event":
{ Args: { "event_id": string }; Returns: undefined
                           },
"retire_member":
{ Args: { "target_member_id": string }; Returns: undefined
                           },
"set_member_role":
{ Args: { "member_id": string,"new_role": string }; Returns: undefined
                           }
          }
          Enums: {
            "item_status": "pending"|"in_cart"|"purchased"|"not_found"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "item_status": ["pending", "in_cart", "purchased", "not_found"]
          }
        }
} as const


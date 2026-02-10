"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Phone, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/use-settings";
import { useCalls } from "@/hooks/use-calls";
import { validateCallRequest } from "@/lib/validators";
import { VoiceSelector } from "@/components/calls/voice-selector";
import type { CallRequest } from "@/types/call";

export function CallForm() {
  const { settings } = useSettings();
  const { initiateCall } = useCalls();

  const [form, setForm] = useState<CallRequest>({
    phoneNumber: "",
    contactName: "",
    clientName: settings.defaults.clientName,
    agentName: settings.defaults.agentName,
    companyName: settings.defaults.companyName,
    eventName: settings.defaults.eventName,
    eventHost: settings.defaults.eventHost,
    voice: settings.defaults.voice,
    location: settings.defaults.location,
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateField = (field: keyof CallRequest, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateCallRequest(form);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      await initiateCall(form);
      setForm((prev) => ({
        ...prev,
        phoneNumber: "",
        contactName: "",
      }));
    } catch {
      // Error is already handled by the hook with toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Initiate Call</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Primary fields */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                placeholder="Enter contact name"
                value={form.contactName}
                onChange={(e) => updateField("contactName", e.target.value)}
              />
              {errors.contactName && (
                <p className="text-xs text-red-500">{errors.contactName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                placeholder="Enter phone number"
                value={form.phoneNumber}
                onChange={(e) => updateField("phoneNumber", e.target.value)}
              />
              {errors.phoneNumber && (
                <p className="text-xs text-red-500">{errors.phoneNumber}</p>
              )}
            </div>
          </div>

          {/* Secondary fields in 2-col grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="clientName" className="text-xs">
                Client Name
              </Label>
              <Input
                id="clientName"
                className="h-8 text-sm"
                value={form.clientName}
                onChange={(e) => updateField("clientName", e.target.value)}
              />
              {errors.clientName && (
                <p className="text-xs text-red-500">{errors.clientName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentName" className="text-xs">
                Agent Name
              </Label>
              <Input
                id="agentName"
                className="h-8 text-sm"
                value={form.agentName}
                onChange={(e) => updateField("agentName", e.target.value)}
              />
              {errors.agentName && (
                <p className="text-xs text-red-500">{errors.agentName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName" className="text-xs">
                Company Name
              </Label>
              <Input
                id="companyName"
                className="h-8 text-sm"
                value={form.companyName}
                onChange={(e) => updateField("companyName", e.target.value)}
              />
              {errors.companyName && (
                <p className="text-xs text-red-500">{errors.companyName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventName" className="text-xs">
                Event Name
              </Label>
              <Input
                id="eventName"
                className="h-8 text-sm"
                value={form.eventName}
                onChange={(e) => updateField("eventName", e.target.value)}
              />
              {errors.eventName && (
                <p className="text-xs text-red-500">{errors.eventName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventHost" className="text-xs">
                Event Host
              </Label>
              <Input
                id="eventHost"
                className="h-8 text-sm"
                value={form.eventHost}
                onChange={(e) => updateField("eventHost", e.target.value)}
              />
              {errors.eventHost && (
                <p className="text-xs text-red-500">{errors.eventHost}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location" className="text-xs">
                Location
              </Label>
              <Input
                id="location"
                className="h-8 text-sm"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
              />
              {errors.location && (
                <p className="text-xs text-red-500">{errors.location}</p>
              )}
            </div>
          </div>

          {/* Voice selector */}
          <VoiceSelector
            value={form.voice}
            onChange={(value) => updateField("voice", value)}
          />
          {errors.voice && (
            <p className="text-xs text-red-500">{errors.voice}</p>
          )}

          {/* Submit button */}
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Initiating Call...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4" />
                Initiate Call
              </>
            )}
          </motion.button>
        </form>
      </CardContent>
    </Card>
  );
}

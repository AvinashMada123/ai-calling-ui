"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useSettings } from "@/hooks/use-settings";
import { VOICE_OPTIONS } from "@/lib/constants";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function SettingsForm() {
  const { settings, updateSettings, resetToDefaults } = useSettings();

  const [clientName, setClientName] = useState(settings.defaults.clientName);
  const [agentName, setAgentName] = useState(settings.defaults.agentName);
  const [companyName, setCompanyName] = useState(settings.defaults.companyName);
  const [eventName, setEventName] = useState(settings.defaults.eventName);
  const [eventHost, setEventHost] = useState(settings.defaults.eventHost);
  const [location, setLocation] = useState(settings.defaults.location);
  const [voice, setVoice] = useState(settings.defaults.voice);
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl);
  const [animationsEnabled, setAnimationsEnabled] = useState(
    settings.appearance.animationsEnabled
  );

  useEffect(() => {
    setClientName(settings.defaults.clientName);
    setAgentName(settings.defaults.agentName);
    setCompanyName(settings.defaults.companyName);
    setEventName(settings.defaults.eventName);
    setEventHost(settings.defaults.eventHost);
    setLocation(settings.defaults.location);
    setVoice(settings.defaults.voice);
    setWebhookUrl(settings.webhookUrl);
    setAnimationsEnabled(settings.appearance.animationsEnabled);
  }, [settings]);

  const handleSave = () => {
    updateSettings({
      defaults: {
        clientName,
        agentName,
        companyName,
        eventName,
        eventHost,
        voice,
        location,
      },
      webhookUrl,
      appearance: {
        ...settings.appearance,
        animationsEnabled,
      },
    });
    toast.success("Settings saved");
  };

  const handleReset = () => {
    resetToDefaults();
    toast.success("Settings reset to defaults");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Section 1: Default Call Values */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Default Call Values</CardTitle>
            <CardDescription>
              These values will pre-fill the call form
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agentName">Agent Name</Label>
                <Input
                  id="agentName"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Agent name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventName">Event Name</Label>
                <Input
                  id="eventName"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="Event name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eventHost">Event Host</Label>
                <Input
                  id="eventHost"
                  value={eventHost}
                  onChange={(e) => setEventHost(e.target.value)}
                  placeholder="Event host"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice">Voice</Label>
              <Select value={voice} onValueChange={setVoice}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent>
                  {VOICE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label} — {option.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 2: Webhook Configuration */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Webhook Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input
                id="webhookUrl"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://example.com/webhook"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Section 3: Appearance */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label htmlFor="animations">Enable Animations</Label>
              <Switch
                id="animations"
                checked={animationsEnabled}
                onCheckedChange={setAnimationsEnabled}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Footer Buttons */}
      <motion.div variants={itemVariants} className="flex gap-4">
        <Button onClick={handleSave}>Save Settings</Button>
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </motion.div>
    </motion.div>
  );
}

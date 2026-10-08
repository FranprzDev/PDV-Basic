"use client";

import { Button } from "@finopenpos/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@finopenpos/ui/components/dialog";
import { Settings2Icon } from "lucide-react";
import { useState } from "react";
import {
	bindingLabel,
	eventToBinding,
	HOTKEY_ACTIONS,
	type HotkeyAction,
	loadHotkeys,
	validateBinding,
} from "@/lib/hotkeys/use-hotkeys";

interface HotkeySettingsProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (config: Record<HotkeyAction, string>) => void;
	labels: Record<HotkeyAction, string>;
	title: string;
	resetLabel: string;
	changeLabel: string;
	pressKeyLabel: string;
	conflictLabel: (action: string) => string;
	reservedLabel: string;
}

export function HotkeySettingsButton({
	onSaved,
	labels,
	title,
	resetLabel,
	changeLabel,
	pressKeyLabel,
	conflictLabel,
	reservedLabel,
	buttonLabel,
}: Omit<HotkeySettingsProps, "open" | "onOpenChange"> & {
	buttonLabel: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button
				variant="outline"
				size="icon"
				onClick={() => setOpen(true)}
				aria-label={buttonLabel}
				title={buttonLabel}
			>
				<Settings2Icon className="h-4 w-4" />
			</Button>
			<HotkeySettingsDialog
				open={open}
				onOpenChange={setOpen}
				onSaved={(config) => {
					onSaved(config);
					setOpen(false);
				}}
				labels={labels}
				title={title}
				resetLabel={resetLabel}
				changeLabel={changeLabel}
				pressKeyLabel={pressKeyLabel}
				conflictLabel={conflictLabel}
				reservedLabel={reservedLabel}
			/>
		</>
	);
}

export function HotkeySettingsDialog({
	open,
	onOpenChange,
	onSaved,
	labels,
	title,
	resetLabel,
	changeLabel,
	pressKeyLabel,
	conflictLabel,
	reservedLabel,
}: HotkeySettingsProps) {
	const [config, setConfig] = useState<Record<HotkeyAction, string>>(() =>
		loadHotkeys(typeof localStorage !== "undefined" ? localStorage : undefined),
	);
	const [capturing, setCapturing] = useState<HotkeyAction | null>(null);
	const [error, setError] = useState<string | null>(null);

	const capture = (action: HotkeyAction) => {
		setError(null);
		setCapturing(action);
		const onKey = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const binding = eventToBinding(event);
			const validation = validateBinding(binding, action, config);
			if (!validation.ok) {
				setError(
					validation.reserved
						? reservedLabel
						: conflictLabel(labels[validation.conflictWith ?? action]),
				);
			} else {
				const next = { ...config, [action]: binding };
				setConfig(next);
				onSaved(next);
				setCapturing(null);
			}
			document.removeEventListener("keydown", onKey, true);
		};
		document.addEventListener("keydown", onKey, true);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className="space-y-2">
					{HOTKEY_ACTIONS.map((action) => (
						<div
							key={action}
							className="flex items-center justify-between gap-2"
						>
							<span className="text-sm">{labels[action]}</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => capture(action)}
							>
								{capturing === action
									? pressKeyLabel
									: bindingLabel(config[action])}
							</Button>
						</div>
					))}
				</div>
				{error && <p className="text-destructive text-sm">{error}</p>}
				<div className="flex justify-end gap-2">
					<Button
						variant="ghost"
						onClick={() => {
							const defaults = loadHotkeys(undefined);
							setConfig(defaults);
							onSaved(defaults);
						}}
					>
						{resetLabel}
					</Button>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{changeLabel}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

-- ------------------------------
-- General Settings
-- ------------------------------

-- Set the default font. Requires a Nerd Font installed on your system to render icons properly.
config.font = wezterm.font("MesloLGS Nerd Font Mono")

-- Base font size.
config.font_size = 14.0

-- Vertical spacing between lines of text (1.2 adds a bit of comfortable breathing room).
config.line_height = 1.2

-- Disable WezTerm's tab bar entirely since Tmux handles tabbing and status.
config.enable_tab_bar = false

-- Color scheme (currently commented out, falling back to defaults or system theme).
-- config.color_scheme = "tokyonight_night"

-- Only show resize borders for window decorations, removing the standard macOS title bar for a sleeker look.
config.window_decorations = "RESIZE"

-- Sets the terminal background to be slightly transparent (90% opaque).
config.window_background_opacity = 0.90

-- Adds a macOS native blur effect behind the transparent window.
config.macos_window_background_blur = 20

-- Cursor styling: 'SteadyBar' makes the cursor a vertical line that doesn't blink.
config.default_cursor_style = "SteadyBar"
config.cursor_thickness = "0.1cell"
config.cursor_bg_color = "#7aa2f7"

-- Custom colors for specific terminal elements.
config.colors = {
	-- Sets the cursor background and border to a specific blue hue (#7aa2f7).
	cursor_bg = "#7aa2f7",
	cursor_border = "#7aa2f7",
}

-- ------------------------------
-- Option / Alt behavior
-- ------------------------------
-- Treat the left Option key as a true Alt/Meta modifier instead of letting macOS
-- compose special characters (so Option+Letter actually reaches the shell as Esc+Letter).
config.send_composed_key_when_left_alt_is_pressed = false
config.send_composed_key_when_right_alt_is_pressed = true

-- ------------------------------
-- Keybindings
-- ------------------------------
local act = wezterm.action

config.keys = {
	-- Shift+Enter: send Esc then CR (useful for some REPL/agent tools).
	{ key = "Enter", mods = "SHIFT", action = act.SendString("\x1b\r") },

	-- Cmd+k: clear screen
	{ key = "k", mods = "CMD", action = act.SendString("clear\n") },

	-- ---- macOS-style line/word editing ----
	-- These send the same control sequences the shell already understands,
	-- so they work in zsh, vim, tmux, and most TUIs without extra config.

	-- Option + ←/→  → previous/next word (Esc-b / Esc-f, the readline word motions)
	{ key = "LeftArrow",  mods = "OPT", action = act.SendString("\x1bb") },
	{ key = "RightArrow", mods = "OPT", action = act.SendString("\x1bf") },

	-- Cmd + ←/→  → beginning / end of line (Ctrl-A / Ctrl-E)
	{ key = "LeftArrow",  mods = "CMD", action = act.SendString("\x01") },
	{ key = "RightArrow", mods = "CMD", action = act.SendString("\x05") },

	-- Option + Backspace  → delete previous word (Ctrl-W / \x17)
	{ key = "Backspace", mods = "OPT", action = act.SendString("\x17") },

	-- Cmd + Backspace  → delete to beginning of line (Ctrl-U / \x15)
	{ key = "Backspace", mods = "CMD", action = act.SendString("\x15") },

	-- Cmd + fn+Backspace (Forward Delete)  → delete to end of line (Ctrl-K)
	{ key = "Delete", mods = "CMD", action = act.SendKey({ key = "k", mods = "CTRL" }) },

	-- Quick search (Cmd+F): search across the scrollback.
	{ key = "f", mods = "CMD", action = act.Search({ CaseInSensitiveString = "" }) },
}

-- ------------------------------
-- Hyperlink rules & Open with Neovim
-- ------------------------------
config.hyperlink_rules = wezterm.default_hyperlink_rules()

-- 1. Match rooted paths (absolute paths, or relative starting with ., .., ~)
table.insert(config.hyperlink_rules, {
	regex = [[(?:~|\.|\.\.)?/(?:[a-zA-Z0-9_\.\-]+/)+[a-zA-Z0-9_\.\-]+\.[a-zA-Z0-9]+(?::\d+){0,2}]],
	format = 'goto-file://$0',
})

-- 2. Match project relative paths starting with common workspace directories
table.insert(config.hyperlink_rules, {
	regex = [[\b(?:src|ai|bin|scripts|docs|shared|tests|lib|core|services|sources|config|\.agents|\.codex)/[a-zA-Z0-9_\.\-/]*\.[a-zA-Z0-9]+(?::\d+){0,2}\b]],
	format = 'goto-file://$0',
})

-- Intercept goto-file:// URIs and open them in Neovim (in a right split pane)
wezterm.on('open-uri', function(window, pane, uri)
	local prefix = 'goto-file://'
	if uri:find('^' .. prefix) == 1 then
		local target = uri:sub(#prefix + 1)
		
		-- Extract path, line number, and column number
		local parts = {}
		for part in string.gmatch(target, '[^:]+') do
			table.insert(parts, part)
		end
		
		local filepath = parts[1]
		local line_num = parts[2]
		
		-- Expand home directory prefix (~/)
		if filepath:sub(1, 2) == "~/" then
			local home = os.getenv("HOME") or "."
			filepath = home .. filepath:sub(2)
		end
		
		-- Build command arguments
		local args = { 'nvim' }
		if line_num then
			table.insert(args, '+' .. line_num)
		end
		table.insert(args, filepath)
		
		-- Open in Neovim in a split pane to the right
		window:perform_action(
			wezterm.action.SplitPane {
				direction = 'Right',
				command = { args = args },
			},
			pane
		)
		return false
	end
end)

return config

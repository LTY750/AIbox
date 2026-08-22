const initialTheme = localStorage.getItem('initial-theme')

if (initialTheme === 'light' || initialTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', initialTheme)
  document.documentElement.setAttribute('data-mantine-color-scheme', initialTheme)
}

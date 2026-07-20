"""CLI smoke + (Task 6) run-command wiring tests."""

from beadz_cro_bench import cli


def test_help_lists_subcommands(capsys):
    try:
        cli.main(["--help"])
    except SystemExit as exc:
        assert exc.code == 0
    out = capsys.readouterr().out
    assert "run" in out
    assert "fetch-models" in out

# Get latest main and keep your calendar work

Your situation:

- **Local main** is 1 commit ahead (design plan) and **3 commits behind** origin/main (image module work from other PC).
- Your **calendar implementation** is currently uncommitted (modified + untracked files).

Do this in order:

---

## Step 1: Commit your current work

This saves all the calendar implementation so it’s part of your branch.

```bash
# Stage everything (modified + new files)
git add -A

# Commit with a clear message
git commit -m "calendar module: migration, actions, UI, tab, i18n"
```

---

## Step 2: Fetch the latest from origin

```bash
git fetch origin
```

---

## Step 3: Merge origin/main into your main

This brings the 3 commits from the other PC (e.g. image module) into your branch and keeps your 2 commits (design plan + calendar implementation) on top.

```bash
git merge origin/main
```

- If there are **no conflicts**, Git will create a merge commit and you’re done.
- If there are **conflicts**, Git will list the files. Open them, fix the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), then:

  ```bash
  git add <fixed-files>
  git commit -m "merge origin/main into main"
  ```

---

## Step 4: Push to origin

After the merge (and any conflict resolution), push your main so the remote has both the image module work and your calendar work:

```bash
git push origin main
```

---

## Summary

| Step | Command                                                  | What it does                                           |
| ---- | -------------------------------------------------------- | ------------------------------------------------------ |
| 1    | `git add -A` then `git commit -m "calendar module: ..."` | Saves your calendar work as a commit                   |
| 2    | `git fetch origin`                                       | Downloads latest commits from remote                   |
| 3    | `git merge origin/main`                                  | Brings those commits into your main (main + your work) |
| 4    | `git push origin main`                                   | Updates remote main with everything                    |

Result: **origin/main** will have the image module commits and your calendar commits (design plan + implementation).

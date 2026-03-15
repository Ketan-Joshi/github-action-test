# Create the correct folder structure
mkdir -p .github/workflows

# Move deploy.yml into the right place
mv deploy.yml .github/workflows/deploy.yml

# Also organize the other files into proper folders
mkdir -p bin landing-zone/lib ecs-apps/lib shared

mv app.ts bin/
mv vpc-construct.ts landing-zone/lib/
mv alb-construct.ts landing-zone/lib/
mv landing-zone-stack.ts landing-zone/lib/
mv ecs-apps-stack.ts ecs-apps/lib/
mv ecs-service-construct.ts ecs-apps/lib/
mv config.ts shared/

# Commit and push
git add .
git commit -m "fix: correct folder structure for CDK and GitHub Actions"
git push origin main
